# 政大研究媒合平台

校內研究媒合基礎設施:讓研究需求與人才在可驗證身分、可留存紀錄的環境中對接。
**目前為示範環境,所有教授與需求皆為假資料,不含任何真實個資。**

## 已實作功能

- **依領域瀏覽**:學院 → 學系 → 研究領域 → 子領域 → 教授,對應目錄式分級導覽
- **教授檔案**:職稱、系所、研究專長(連回子領域)、媒合開關、開放中需求
- **開放需求與申請**:五類(課程助教 TA/系辦短期 DEPT/大專生計畫 UR/推薦信 REC/產學跨域 IND),申請狀態機 `pending → interview_invited → interviewed → accepted/rejected`,同一需求不可重複申請(資料庫層 UNIQUE 約束)
- **登入**:限校內信箱網域(可由環境變數設定),六位數驗證碼、一次性使用、10 分鐘過期、資料庫只存雜湊;session token 亦只存雜湊
- **條款簽署存證**:版本化,記錄帳號/版本/時間/IP/UA(AgreementLog)
- **檢舉**:任何登入使用者可檢舉,含結案結果欄位(供檢舉成立比例統計)
- **管理後台**(僅 ADMIN):教授帳號審核、檢舉結案;所有管理操作寫入稽核紀錄(AuditLog)
- **格狀瀏覽與即時篩選**:教授列表為格狀卡片(資訊分層),需求列表篩選即點即套用、不重新載入
- **三步驟申請表單**:背景興趣 → 時間技能 → 確認送出,結構化引導取代單一大文字框
- **教授端並排比較申請**:`/postings/<id>/applications` 卡片式並排,可直接邀請面試/通過/婉拒
- **身分視角切換**:同帳號可切換學生/教授導覽視角(僅影響顯示,權限判斷不受影響)
- **教授新手引導清單**:完成度進度條(簡介/專長/首則需求),全部完成後自動隱藏
- **進度可視化**:「我的申請」四段狀態列、「我的檢舉」處理狀態,取代送出後石沉大海
- **站內通知**:新申請、狀態更新、檢舉結案(檢舉雙方皆收到中性通知)、教授審核結果;導覽列鈴鐺顯示未讀數
- **首頁「為你精選」**:目前為非個人化輪替版(個人化需先累積興趣/瀏覽資料,已標註)

## 快速開始(本機開發)

```bash
npm install
cp .env.example .env        # 填 SESSION_SECRET(openssl rand -hex 32)
npm run db:migrate           # 建立資料表
npm run db:seed              # 匯入政大學院系所結構 + 示範資料
npm run dev                  # http://localhost:3000
```

開發環境登入:輸入任何 `@g.nccu.edu.tw` 信箱,驗證碼會直接顯示在畫面上(正式環境改為寄信,見下方)。
管理後台:以 `admin@nccu.edu.tw` 登入即可進入 `/admin`(種子已建立此示範管理員)。
教授視角測試:以 `professor.demo@nccu.edu.tw` 登入,即可使用身分切換、教授儀表板與並排比較申請(種子已將此帳號連結第一位示範教授)。

## 推上 GitHub

```bash
# 在 GitHub 建立空白私有 repo 後:
git remote add origin git@github.com:<你的帳號>/<repo 名稱>.git
git push -u origin main
```

建議 repo 設定(對應多社團協作的權限控管):
1. Settings → Branches → 對 `main` 設 branch protection:**Require pull request before merging + Require approvals(至少 1)**。
2. 貢獻者一律 fork 或開 feature branch,經 Pull Request 審查後才能併入,任何人都不直接推 main。
3. `.env` 已列入 .gitignore,**正式環境的密鑰永遠不進版本庫**。

## 資料結構與修改分類樹

政大學院/系所/領域/子領域的唯一資料來源:`src/server/db/data/nccu-structure.json`。

- 學院與系所名稱為依公開資訊整理的初版,**正式使用前請依政大官網逐一校正**(檔內已標註)。
- 領域與子領域目前僅英國語文學系有完整示範,其餘系所留空,各系資料補進 JSON 後執行 `npm run db:reset` 重建即可。
- 教授為示範假資料;正式資料的匯入方式建議另寫匯入腳本,並依平台規範經教授本人確認後上架。

## 換資料庫(SQLite → PostgreSQL)

目前開發環境使用 SQLite(零安裝、單一檔案)。換 PostgreSQL 的改動範圍已刻意收斂在兩個位置:

1. `src/server/db/schema.ts`:import 來源自 `drizzle-orm/sqlite-core` 改為 `drizzle-orm/pg-core`,對應型別調整(檔頭有指引)。
2. `src/server/db/client.ts`:改用 `drizzle-orm/node-postgres` + `pg` 連線池,讀 `DATABASE_URL`。

之後 `drizzle.config.ts` 的 dialect 改 `postgresql`,重新 `drizzle-kit generate && drizzle-kit migrate`。
**頁面與 repositories 之上的所有業務程式碼不需改動**——這是本專案的資料層抽象邊界(所有資料存取都經過 `src/server/repositories/`,頁面不直接 import schema)。

## 部署(對應未來搬進校內主機)

```bash
docker compose up -d --build
```

docker-compose 內含 app + PostgreSQL 參考組態。上正式環境前的必辦清單:

- [ ] `SESSION_SECRET` 換為強亂數且不進版本庫
- [ ] 驗證碼改為寄信(`src/server/auth.ts` 的 `issueCode` 有標註接點;正式模式本來就不會回傳 devCode)
- [ ] 換 PostgreSQL(見上節)並確認資料落地位置符合條款揭露
- [ ] 反向代理(nginx/caddy)+ HTTPS
- [ ] 備份排程:每日增量 + 每週完整,備份與正式庫權限分離
- [ ] 條款文字經法律諮詢後,更新 `src/server/terms.ts` 的版本號(舊使用者將被要求重新簽署)
- [ ] 清除種子示範資料,匯入正式分類樹

## 專案結構

```
src/
├── app/                     # Next.js App Router 頁面與 API
│   ├── browse/              # 學院 → 系所 → 領域瀏覽
│   ├── subfields/[id]/      # 子領域 → 教授列表
│   ├── professors/[id]/     # 教授檔案
│   ├── postings/            # 開放需求列表與詳情(含申請/檢舉表單)
│   ├── login/ terms/ admin/ # 登入、條款簽署、管理後台
│   ├── api/auth/            # 驗證碼申請與驗證
│   └── actions.ts           # Server Actions(申請/簽署/檢舉/管理,皆寫稽核)
└── server/
    ├── auth.ts              # session、驗證碼、網域白名單、條款簽署
    ├── terms.ts             # 條款版本與文字(草稿,待法律審閱)
    ├── db/
    │   ├── schema.ts        # Drizzle schema(換 DB 指引在檔頭)
    │   ├── client.ts        # 連線單例
    │   ├── seed.ts          # 種子腳本
    │   └── data/nccu-structure.json  # 分類樹唯一資料來源
    └── repositories/        # 資料存取層(換 DB/ORM 的改動邊界)
```

## 尚未實作(依架構書之後續開發順序)

站內訊息(含頻率上限)、分層揭露與揭露留痕、帳號生命週期自動化(校友轉換/緩衝期/媒合案凍結)、面試時段 + .ics(含 token 到期)、群組、AI 輔助(標籤建議/摘要)、學期聚合報告 dashboard、管理員雙人會簽與調閱留痕細化。
