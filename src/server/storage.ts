// 私有檔案儲存抽象層(§6)
// ─────────────────────────────────────────────────────────────
// 2026-08 換資料庫/託管紀錄:免費無伺服器託管(Vercel)沒有可長駐、跨請求共用的本機
// 檔案系統,private-uploads/ 目錄寫入的內容在下一次請求或函式冷啟動後就可能消失。
// 因此改為視環境自動切換儲存後端,呼叫端(repositories/attachments.ts、API route)
// 完全不需要跟著改——這正是原本設計 saveFile()/readFile()/deleteFile() 三個函式作為
// 唯一進出口的目的:
//   - 有設定 BLOB_READ_WRITE_TOKEN(部署在 Vercel 且已連接 Blob store)時:走 Vercel Blob
//     私有儲存(access:"private",沒有可公開直接存取的網址,只能透過本檔案的 readFile()
//     搭配 BLOB_READ_WRITE_TOKEN 在伺服器端讀取——維持與原本本機檔案「不可直接以固定
//     網址存取」相同的安全性質)。
//   - 未設定時(本機開發、或未來自架伺服器):維持原本寫本機 private-uploads/ 目錄的行為,
//     不需要另外申請 Blob store 才能跑 npm run dev。
import { randomUUID } from "node:crypto";
import { mkdir, writeFile, readFile as fsReadFile, unlink } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { put, del as blobDel, get as blobGet } from "@vercel/blob";
import { db } from "@/server/db/client";
import * as t from "@/server/db/schema";

const STORAGE_DIR = path.join(process.cwd(), "private-uploads");
const useBlob = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);

// 2026-08-31 新增的第三種後端:存進 PostgreSQL。
// ─────────────────────────────────────────────────────────────
// 補的是一個原本會直接卡死使用者的缺口。此前的邏輯只有兩條路:有 Blob token 就走
// Vercel Blob,否則寫本機磁碟。但部署在無伺服器平台時磁碟是唯讀的,於是「沒有另外去
// 建立 Blob store」的站台,上傳一定失敗——而建 Blob store 是一連串主控台操作,最後
// 還有一個很容易漏掉的重新部署步驟,對只是想把網址丟給人試用的情況來說太重了。
//
// 但這種站台其實已經有一個現成、且必定已經設定好的儲存空間:它自己的 PostgreSQL。
// 單檔上限 5–10MB,Neon 免費方案 0.5GB,試用與示範綽綽有餘。因此優先序改為:
//   1. 有 BLOB_READ_WRITE_TOKEN → Vercel Blob(檔案量大時的正解,行為完全不變)
//   2. 沒有 Blob 但磁碟不可寫(無伺服器)→ PostgreSQL
//   3. 兩者皆非(本機開發、自架主機)→ 維持原本寫 private-uploads/ 的行為
// 三條路的進出口仍是同樣的 saveFile/readFile/deleteFile,呼叫端完全不需要知道差別。
const useDb = () => !useBlob() && Boolean(process.env.VERCEL);

// ── §6 類型白名單:以檔案內容特徵(magic number)判斷,不信任副檔名或使用者端聲稱的 Content-Type ──
const MAGIC_NUMBERS: Array<{ mime: string; ext: string; check: (buf: Buffer) => boolean }> = [
  { mime: "application/pdf", ext: "pdf", check: (b) => b.subarray(0, 5).toString("latin1") === "%PDF-" },
  {
    // DOCX 本質是 ZIP 容器,檔頭與純 ZIP 相同,只用檔頭無法百分之百區分 DOCX 與其他 ZIP,
    // 這是已知限制:若要更精確,需再解壓檢查內部是否含 [Content_Types].xml,此處先以檔頭
    // 白名單 + 大小限制作為第一層防線,足以擋下絕大多數偽裝副檔名的攻擊(如 .exe 改名 .docx)。
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ext: "docx",
    check: (b) => b.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])),
  },
  // 白皮書 2.7.2 群組共用檔案區新增:允許 PDF、圖片。圖片僅收 JPEG/PNG 兩種常見格式,
  // 一樣以檔頭 magic number 判斷,不信任副檔名。
  { mime: "image/jpeg", ext: "jpg", check: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    mime: "image/png", ext: "png",
    check: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
];

export const MAX_FILE_SIZE = 10 * 1024 * 1024; // §6:單檔硬上限 10MB(一般附件,如申請履歷)

// 白皮書 2.7.2:群組共用檔案區專屬限制,比一般附件更嚴格,且允許類型不同(僅 PDF/圖片,
// 不含 Word)。detectFileType() 只負責「能不能辨識這個格式」,是否允許出現在某個情境
// (申請附件 vs 群組檔案)由呼叫端(api/files/upload/route.ts)依情境各自的白名單決定,
// 避免因為在此新增了圖片辨識,就連帶讓履歷附件也能上傳圖片(非本次需求範圍)。
export const GROUP_FILE_MAX_SIZE = 5 * 1024 * 1024; // 單檔上限 5MB
export const GROUP_FILE_TOTAL_QUOTA = 100 * 1024 * 1024; // 群組檔案總量上限 100MB
export const GROUP_FILE_RETENTION_MS = 30 * 24 * 3600_000; // 僅保留一個月
export const GROUP_FILE_REMINDER_BEFORE_MS = 7 * 24 * 3600_000; // 到期前一週提醒
export const GROUP_FILE_ALLOWED_EXTS = new Set(["pdf", "jpg", "png"]);
export const APPLICATION_FILE_ALLOWED_EXTS = new Set(["pdf", "docx"]); // 既有履歷附件情境,行為不變

export function detectFileType(buf: Buffer): { mime: string; ext: string } | null {
  const hit = MAGIC_NUMBERS.find((m) => m.check(buf));
  return hit ? { mime: hit.mime, ext: hit.ext } : null;
}

/** 儲存檔案,回傳儲存端識別碼(Blob 模式為私有 blob 網址;本機模式為系統隨機檔名)——
 *  與使用者原始檔名完全無關,防路徑穿越攻擊。呼叫端只需把回傳值原樣存進
 *  attachments.storedFilename,不需要知道背後是哪種儲存後端。 */
export async function saveFile(buf: Buffer, ext: string): Promise<string> {
  if (useBlob()) {
    const blob = await put(`attachments/${randomUUID()}.${ext}`, buf, {
      access: "private",
      addRandomSuffix: true,
    });
    return blob.url;
  }
  // 無伺服器環境且未設定 Blob:存進資料庫(見檔頭 useDb 的說明)。
  // 這條路取代了原本「拋出錯誤要使用者先去建 Blob store」的行為——那個做法雖然訊息
  // 清楚,但使用者依然是卡住的,而這裡其實有辦法讓它直接可用。
  if (useDb()) {
    const storedFilename = `${randomUUID()}.${ext}`;
    await db.insert(t.fileBlobs).values({ storedFilename, data: buf, sizeBytes: buf.length });
    return storedFilename;
  }
  await mkdir(STORAGE_DIR, { recursive: true });
  const storedFilename = `${randomUUID()}.${ext}`;
  await writeFile(path.join(STORAGE_DIR, storedFilename), buf);
  return storedFilename;
}

export async function readFile(storedFilename: string): Promise<Buffer> {
  if (useBlob()) {
    const result = await blobGet(storedFilename, { access: "private" });
    if (!result || !result.stream) throw new Error(`Blob not found: ${storedFilename}`);
    return Buffer.from(await new Response(result.stream).arrayBuffer());
  }
  if (useDb()) {
    const [row] = await db.select({ data: t.fileBlobs.data }).from(t.fileBlobs)
      .where(eq(t.fileBlobs.storedFilename, storedFilename));
    if (!row) throw new Error(`File not found: ${storedFilename}`);
    return row.data;
  }
  // 防路徑穿越:即使 storedFilename 來源不可信,也不允許跳出儲存目錄
  const safe = path.basename(storedFilename);
  return fsReadFile(path.join(STORAGE_DIR, safe));
}

export async function deleteFile(storedFilename: string): Promise<void> {
  if (useBlob()) {
    await blobDel(storedFilename).catch(() => {}); // 檔案已不存在時忽略,呼應原本本機模式的行為
    return;
  }
  if (useDb()) {
    await db.delete(t.fileBlobs).where(eq(t.fileBlobs.storedFilename, storedFilename));
    return; // DELETE 找不到列時不算錯誤,與下面本機模式忽略 ENOENT 的行為一致
  }
  const safe = path.basename(storedFilename);
  await unlink(path.join(STORAGE_DIR, safe)).catch(() => {}); // 檔案已不存在時忽略
}
