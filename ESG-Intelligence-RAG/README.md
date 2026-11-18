# ESG Intelligence Platform — RAG Engine

**دستیار هوشمند ESG** برای جست‌وجو در گزارش‌های پایداری، استانداردهای زیست‌محیطی، داده‌های ممیزی و مستندات ESG.

این پوشه هستهٔ موتور RAG است و کاملاً مستقل اجرا می‌شود. رابط کاربری جدا (React یا .NET) است.

---

## این پروژه چیست؟ (یک جمله)

فایل‌های ESG (گزارش پایداری، استاندارد، ممیزی، سیاست‌ها، جداول داده) را می‌گیرد → تکه می‌کند → embedding می‌سازد → در Vector DB و Postgres نگه می‌دارد → به درخواست کاربر **گزارش ESG** تولید می‌کند، در کتابخانهٔ گزارش‌ها ذخیره می‌کند و امکان **گزارش تجمیعی** از ادوار مختلف را می‌دهد.

---

## قابلیت‌های اصلی ESG

| قابلیت | توضیح |
|--------|--------|
| **Ingestion چندفرمت** | PDF، Word، Excel، CSV، Markdown، متن و ... وارد سیستم RAG می‌شوند |
| **جست‌وجوی معنایی + متنی** | روی گزارش‌های ESG، استانداردها (GRI، SASB، TCFD، ESRS و ...)، داده‌های ممیزی و مستندات پایداری |
| **تولید گزارش ESG** | کاربر درخواست می‌دهد → سیستم از منابع Postgres + RAG محتوا می‌خواند و گزارش ساختاریافته می‌سازد |
| **کتابخانه گزارش‌ها** | هر گزارش تولیدشده با متادیتا (دوره، نوع، نسخه، منابع) آرشیو می‌شود |
| **گزارش تجمیعی** | از گزارش‌های ساخته‌شده در دوره‌های مختلف می‌توان گزارش مقایسه‌ای / تجمیعی گرفت |
| **منابع جدولی Postgres** | علاوه بر فایل‌ها، داده‌ها می‌توانند از جداول ساخت‌یافته Postgres بیایند (تعریف جداول بعدی) |

---

## شکل کلی سیستم

```
                         ┌──────────────────────────────────┐
   Client/UI ───────────►│  FastAPI Backend  :8000          │
   (React / .NET / curl) │  ESG Intelligence API            │
                         └──────────────┬───────────────────┘
           ┌──────────────┬─────────────┼──────────┬────────────────┐
           ▼              ▼             ▼          ▼                ▼
      PostgreSQL       Qdrant        Redis      MinIO           Ollama
      + pgvector       vectors       cache      files         embeddings
      metadata / FTS                                              / LLM
      گزارش‌ها / جداول ESG
```

راه‌اندازی با یک دستور:

```bash
cd docker
cp .env.example .env   # اختیاری
docker compose up -d --build
```

تست:

```bash
curl http://localhost:8000/api/health
```

---

## انواع گزارش ESG (report_type)

| نوع | کاربرد |
|-----|--------|
| `esg_periodic` | گزارش دوره‌ای (سه‌ماهه / سالانه) |
| `esg_environmental` | بخش محیط‌زیست (E) |
| `esg_social` | بخش اجتماعی (S) |
| `esg_governance` | بخش حاکمیتی (G) |
| `esg_audit` | گزارش ممیزی / اطمینان‌بخشی |
| `esg_aggregate` | گزارش تجمیعی از چند دوره / چند گزارش قبلی |
| `esg_custom` | درخواست سفارشی کاربر |
| `answer` | پاسخ چت معمولی (سازگاری با نسخه قبلی) |

---

## سرویس‌های Docker

| سرویس | تصویر | پورت | وظیفه |
|-------|--------|------|--------|
| **postgres** | `pgvector/pgvector:pg16` | 5432 | اسناد، chunk، workspace، job، ایندکس، FTS، **آرشیو گزارش‌های ESG**، جداول داده ESG |
| **qdrant** | `qdrant/qdrant` | 6333 | جست‌وجوی برداری |
| **redis** | `redis:7-alpine` | 6379 | کش پاسخ و invalidation |
| **minio** | `minio/minio` | 9000 / 9001 | انبار فایل (اختیاری) |
| **ollama** | `ollama/ollama` | 11434 | embedding و در صورت نیاز LLM محلی |
| **backend** | build از Dockerfile همین پروژه | 8000 | API اصلی ESG Intelligence |

شبکه: `rag-net`  
Volumeها: Postgres، Qdrant، Redis، MinIO، Ollama، فایل‌های local.

---

## ساختار پوشه‌ها

```
ESG-Intelligence-RAG/
├── README.md
├── ENTERPRISE.md
├── backend/
│   ├── main.py                 ← APIها + pipeline ingestion / chat / گزارش
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── app/
│   │   ├── db.py               ← Postgres schema (شامل جداول گزارش و placeholder ESG)
│   │   ├── bootstrap.py
│   │   ├── core/config.py
│   │   ├── storage/
│   │   │   ├── interfaces.py   ← Vector / Metadata / Report
│   │   │   ├── factory.py
│   │   │   ├── qdrant_adapter.py
│   │   │   ├── postgres_adapter.py
│   │   │   ├── object_store.py
│   │   │   └── vector_ops.py
│   │   ├── cache/redis_cache.py
│   │   ├── api/reports.py      ← کتابخانه گزارش + تجمیع
│   │   └── migrate_sqlite.py
│   └── tests/
├── docker/
│   ├── docker-compose.yml
│   ├── .env.example
│   └── backend-entrypoint.sh
└── tests/
```

---

## استک فناوری

| لایه | تکنولوژی |
|------|-----------|
| زبان | Python 3.12 |
| API | FastAPI + Uvicorn |
| DB | PostgreSQL 16 + pgvector |
| Vector | Qdrant (پیش‌فرض) یا pgvector |
| Cache | Redis |
| Object store | Local disk یا MinIO |
| Embedding / LLM | Ollama (محلی) یا هر endpoint سازگار با OpenAI |
| Auth | JWT ساده + workspace isolation |

---

## متغیرهای محیطی مهم

پیشوند فنی فعلی `KNOWLEDGEOS_*` است (برای سازگاری با لایهٔ قبلی). می‌توانید بعداً به `ESG_*` مهاجرت دهید.

```bash
KNOWLEDGEOS_POSTGRES_URL=postgresql://knowledgeos:knowledgeos@localhost:5432/knowledgeos
KNOWLEDGEOS_VECTOR_BACKEND=qdrant          # یا postgres
KNOWLEDGEOS_QDRANT_URL=http://localhost:6333
KNOWLEDGEOS_REDIS_URL=redis://localhost:6379/0
KNOWLEDGEOS_OBJECT_STORE=local             # یا minio
KNOWLEDGEOS_ARCHIVE_REPORTS=true
KNOWLEDGEOS_OLLAMA_BASE_URL=http://127.0.0.1:11434
KNOWLEDGEOS_OLLAMA_EMBEDDING_MODEL=all-minilm
```

---

## جریان تولید گزارش ESG

1. کاربر فایل‌های ESG / استاندارد / ممیزی را آپلود می‌کند (یا داده جدولی در Postgres وارد می‌شود).
2. pipeline: parse → chunk → embed → index در Qdrant/pgvector + metadata در Postgres.
3. کاربر از طریق UI یا API درخواست گزارش می‌دهد (مثلاً «گزارش محیط‌زیست سال ۱۴۰۳»).
4. سیستم با RAG + منابع Postgres محتوا را جمع می‌کند و با LLM گزارش می‌سازد.
5. گزارش با `report_type` مناسب در جدول گزارش‌ها ذخیره می‌شود (کتابخانه).
6. بعداً می‌توان چند گزارش را انتخاب کرد و درخواست `esg_aggregate` داد تا گزارش تجمیعی ساخته شود.

---

## API گزارش‌ها (خلاصه)

```
POST   /api/v1/reports              → ذخیره گزارش جدید
GET    /api/v1/reports?workspace_id=...  → لیست کتابخانه گزارش‌ها
GET    /api/v1/reports/{id}         → دریافت یک گزارش
POST   /api/v1/reports/aggregate    → تولید گزارش تجمیعی از چند گزارش قبلی
```

جزئیات و فیلدهای `metadata` (دوره، استاندارد مرجع، scope، ...) در `app/api/reports.py` و interface گزارش تعریف شده‌اند.

---

## جداول داده ESG در Postgres

جداول ساخت‌یافته (شاخص‌های کربن، مصرف انرژی، تنوع نیروی کار، ... ) بعداً تعریف می‌شوند.  
موتور فعلی آمادهٔ خواندن از هر جدول Postgres است؛ فقط کافی است adapter یا view مناسب اضافه شود.

---

## UIهای همراه

- **ESG-Intelligence-Web-React** — رابط React مدرن
- **ESG-Intelligence-Web-DotNet** — رابط Razor Pages (.NET)

هر دو به همین backend متصل می‌شوند.

---

## مجوز

همان LICENSE پروژه پایه.
