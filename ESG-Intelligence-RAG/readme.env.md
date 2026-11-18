# راهنمای تنظیمات `.env` — پروژه Knowledge RAG

این فایل تمام متغیرهای محیطی مهم موتور RAG را توضیح می‌دهد.  
فایل نمونه کنار Docker:

```text
01-KnowledgeRAG/docker/.env.example
```

برای اجرا:

```bash
cd docker
cp .env.example .env
# ویرایش .env
docker compose up -d --build
```

نام‌گذاری: متغیرهایی که با `KNOWLEDGEOS_` شروع می‌شوند مربوط به خود برنامه هستند. بقیه اغلب پورت/رمز سرویس‌های Compose هستند.

---

## ۱. حداقل تنظیمات برای شروع

اگر فقط می‌خواهید سیستم بالا بیاید، این‌ها کافی است (مقادیر پیش‌فرض Compose معمولاً کار می‌کنند):

| متغیر | معنی ساده | پیشنهاد شروع |
|--------|-----------|----------------|
| `POSTGRES_USER` / `PASSWORD` / `DB` | کاربر و دیتابیس Postgres | `knowledgeos` |
| `KNOWLEDGEOS_POSTGRES_URL` | آدرس کامل Postgres برای backend | در Compose خودکار ساخته می‌شود |
| `KNOWLEDGEOS_VECTOR_BACKEND` | کجا بردار ذخیره شود | `qdrant` |
| `KNOWLEDGEOS_OLLAMA_EMBEDDING_MODEL` | مدل embedding | `all-minilm` |
| `KNOWLEDGEOS_ALLOW_ANONYMOUS` | بدون لاگین | `true` (فقط توسعه) |
| `KNOWLEDGEOS_CORS_ORIGINS` | دامنه‌های مجاز UI | `http://localhost:5173,http://localhost:5180` |

---

## ۲. پورت‌ها و سرویس‌های Docker Compose

این‌ها معمولاً فقط در فایل `.env` کنار `docker-compose.yml` معنی دارند و پورت میزبان را مشخص می‌کنند.

| متغیر | پیش‌فرض | کار |
|--------|---------|-----|
| `BACKEND_PORT` | `8000` | API موتور RAG روی میزبان |
| `POSTGRES_PORT` | `5432` | Postgres روی میزبان |
| `QDRANT_PORT` | `6333` | HTTP Qdrant |
| `QDRANT_GRPC_PORT` | `6334` | gRPC Qdrant (اختیاری) |
| `REDIS_PORT` | `6379` | Redis |
| `MINIO_PORT` | `9000` | API MinIO |
| `MINIO_CONSOLE_PORT` | `9001` | کنسول وب MinIO |
| `OLLAMA_PORT` | `11434` | Ollama |

اگر پورت روی ماشین‌تان اشغال است، فقط همین اعداد را عوض کنید.

### هویت Postgres داخل Compose

| متغیر | پیش‌فرض | نکته |
|--------|---------|------|
| `POSTGRES_USER` | `knowledgeos` | کاربر دیتابیس |
| `POSTGRES_PASSWORD` | `knowledgeos` | **در تولید حتماً عوض شود** |
| `POSTGRES_DB` | `knowledgeos` | نام دیتابیس |

URLی که backend می‌بیند معمولاً این شکل است:

```text
postgresql://USER:PASSWORD@postgres:5432/DB
```

در شبکه Docker نام هاست `postgres` است، نه `localhost`.

---

## ۳. پایگاه داده و Metadata

| متغیر | پیش‌فرض مفهومی | توضیح کامل |
|--------|----------------|------------|
| `KNOWLEDGEOS_POSTGRES_URL` | *(اجباری در runtime)* | اتصال اصلی. بدون این، سیستم بالا نمی‌آید. SQLite حذف شده است. |
| `KNOWLEDGEOS_METADATA_BACKEND` | `postgres` | فقط Postgres پشتیبانی می‌شود. |
| `KNOWLEDGEOS_PG_POOL_SIZE` | *(داخل کد/پیش‌فرض pool)* | اندازه استخر اتصال به Postgres در بار بالا. |
| `KNOWLEDGEOS_PG_STATEMENT_TIMEOUT_MS` | اختیاری | محدودیت زمان اجرای هر کوئری SQL (میلی‌ثانیه). |
| `KNOWLEDGEOS_DATA_DIR` | `/data` در Docker | مسیر داده محلی (فایل‌ها، در حالت object store=local). |
| `KNOWLEDGEOS_ARCHIVE_REPORTS` | `true` | آرشیو گزارش‌ها/ردپا در Postgres. |

**چرا مهم است؟**  
Postgres هم اسناد و chunk متن و job را نگه می‌دارد، هم (در حالت pgvector) می‌تواند بردار را هم نگه دارد.

---

## ۴. Vector Database (مهم‌ترین سوییچ معماری)

| متغیر | مقادیر | پیش‌فرض | معنی |
|--------|--------|---------|------|
| `KNOWLEDGEOS_VECTOR_BACKEND` | `qdrant` یا `postgres` | **`qdrant`** | محل ذخیره و جست‌وجوی embedding |

### حالت `qdrant` (پیش‌فرض)

- بردارها → **Qdrant**
- متن و metadata → **PostgreSQL**
- مناسب محیط‌های پرترافیک و جست‌وجوی برداری اختصاصی

| متغیر | پیش‌فرض | توضیح |
|--------|---------|--------|
| `KNOWLEDGEOS_QDRANT_URL` | `http://qdrant:6333` در Docker | آدرس Qdrant |
| `KNOWLEDGEOS_QDRANT_COLLECTION` | `knowledge_chunks` | نام collection |
| `KNOWLEDGEOS_QDRANT_API_KEY` | خالی | اگر Qdrant با API Key قفل شده باشد |

### حالت `postgres` (pgvector)

```env
KNOWLEDGEOS_VECTOR_BACKEND=postgres
```

- بردارها داخل همان PostgreSQL با افزونه **pgvector**
- نیازی به سرویس Qdrant نیست (می‌توانید در Compose خاموشش کنید، ولی ماندنش ضرری ندارد)
- ساده‌تر برای استقرار کوچک یا air-gapped

**توجه:** عوض کردن backend بعد از ایندکس شدن اسناد، نیاز به **ایندکس مجدد** دارد؛ بردارهای قبلی خودکار مهاجرت نمی‌شوند مگر اسکریپت مهاجرت جدا اجرا شود.

---

## ۵. Redis (کش)

| متغیر | پیش‌فرض | توضیح |
|--------|---------|--------|
| `KNOWLEDGEOS_REDIS_URL` | `redis://redis:6379/0` در Docker | آدرس Redis |
| `KNOWLEDGEOS_CACHE_TTL_SECONDS` | حدود ۷ روز | عمر کش پاسخ chat |
| `KNOWLEDGEOS_CACHE_SEMANTIC_ENABLED` | `false` | کش معنایی پیشرفته (در صورت پشتیبانی کد) |
| `KNOWLEDGEOS_CACHE_SIMILARITY` | اختیاری | آستانه شباهت برای کش معنایی |
| `KNOWLEDGEOS_CACHE_DISABLED_DURING_EVAL` | اختیاری | هنگام ارزیابی، کش را خاموش کند |

نکات:

- اگر Redis در دسترس نباشد، معمولاً سیستم با fallback ضعیف‌تر ادامه می‌دهد (بسته به مسیر کد).
- در حالت **`require_citations=true`** (پاسخ فقط با استناد)، کش برای آن درخواست عمداً استفاده نمی‌شود تا جواب حساس از کش شل‌تر نیاید.

---

## ۶. Object Storage — فایل اسناد

| متغیر | مقادیر | پیش‌فرض | معنی |
|--------|--------|---------|------|
| `KNOWLEDGEOS_OBJECT_STORE` | `local` یا `minio` | **`local`** | کجا فایل خام ذخیره شود |

### `local`

- فایل‌ها روی volume / مسیر `KNOWLEDGEOS_DATA_DIR`
- مناسب توسعه و نصب تک‌سرور

### `minio`

```env
KNOWLEDGEOS_OBJECT_STORE=minio
KNOWLEDGEOS_MINIO_ENDPOINT=minio:9000
KNOWLEDGEOS_MINIO_ACCESS_KEY=knowledgeos
KNOWLEDGEOS_MINIO_SECRET_KEY=knowledgeossecret
KNOWLEDGEOS_MINIO_BUCKET=knowledgeos
KNOWLEDGEOS_MINIO_SECURE=false
```

| متغیر Compose | نقش |
|----------------|-----|
| `MINIO_ROOT_USER` | کاربر root MinIO (معمولاً همان access key) |
| `MINIO_ROOT_PASSWORD` | رمز root |
| `MINIO_BUCKET` | نام bucket اولیه |

**تولید:** رمز و کلید را عوض کنید و `KNOWLEDGEOS_MINIO_SECURE=true` با TLS واقعی بگذارید.

---

## ۷. Embedding و مدل‌ها (Ollama و جایگزین‌ها)

### Ollama (پیش‌فرض پروژه)

| متغیر | پیش‌فرض | توضیح |
|--------|---------|--------|
| `KNOWLEDGEOS_OLLAMA_BASE_URL` | `http://ollama:11434` در Docker | آدرس سرویس Ollama |
| `KNOWLEDGEOS_OLLAMA_EMBEDDING_MODEL` | `all-minilm` | مدل embedding که باید pull شود |
| `KNOWLEDGEOS_OLLAMA_AUTO_PULL` | وابسته به اسکریپت | آیا مدل خودکار دانلود شود |
| `KNOWLEDGEOS_OLLAMA_AUTO_START` | وابسته به محیط | شروع خودکار daemon (بیشتر خارج Docker) |
| `KNOWLEDGEOS_OLLAMA_PULL_TIMEOUT_SECONDS` | اختیاری | مهلت pull مدل |
| `KNOWLEDGEOS_ALLOW_HASH_EMBEDDING_FALLBACK` | `false` | اگر embedding واقعی نباشد، از hash ساختگی استفاده کند (**فقط debug؛ کیفیت RAG خراب می‌شود**) |

مدل Generation (چت) معمولاً از **Profiles** در API/`Models` UI تنظیم می‌شود، نه فقط از `.env`.

### Embedding از API خارجی (در صورت پیکربندی کد)

| متغیر | معنی |
|--------|------|
| `KNOWLEDGEOS_EMBEDDING_API_BASE_URL` | endpoint سازگار با OpenAI embeddings |
| `KNOWLEDGEOS_EMBEDDING_API_KEY` | کلید API |
| `KNOWLEDGEOS_EMBEDDING_API_MODEL` | نام مدل |

### سایر

| متغیر | معنی |
|--------|------|
| `KNOWLEDGEOS_LMSTUDIO_BASE_URL` | اگر از LM Studio استفاده شود |
| `KNOWLEDGEOS_LMSTUDIO_EMBEDDING_MODEL` | مدل embedding در LM Studio |
| `KNOWLEDGEOS_LOCAL_BGE_MODEL` | مسیر/نام مدل BGE محلی |
| `KNOWLEDGEOS_LOCAL_BGE_AUTO_LOAD` | بارگذاری خودکار BGE |

---

## ۸. امنیت، احراز هویت و CORS

| متغیر | پیش‌فرض | توضیح |
|--------|---------|--------|
| `KNOWLEDGEOS_ALLOW_ANONYMOUS` | `true` | بدون توکن هم API جواب می‌دهد. **در تولید `false` کنید.** |
| `KNOWLEDGEOS_AUTH_SECRET` | مقدار dev | رمز امضای توکن/نشست. باید تصادفی و طولانی باشد. |
| `KNOWLEDGEOS_ENCRYPTION_KEY` | مشتق از auth secret اگر خالی باشد | رمزنگاری کلید APIهای provider ذخیره‌شده |
| `KNOWLEDGEOS_CORS_ORIGINS` | localhostهای UI | لیست جدا شده با ویرگول. اگر UI باز نمی‌شود، این را چک کنید. |
| `KNOWLEDGEOS_SECRETS_DIR` | اختیاری | پوشه نگهداری secretها روی دیسک |
| `KNOWLEDGEOS_PROMPT_INJECTION_GUARD` | وابسته به کد | تقویت فیلتر دستورهای تزریق‌شده داخل سند |

مثال CORS برای هر دو UI:

```env
KNOWLEDGEOS_CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173,http://localhost:5180,http://127.0.0.1:5180
```

---

## ۹. محدودیت حجم، chunk و پردازش

| متغیر | پیش‌فرض تقریبی | معنی |
|--------|----------------|------|
| `KNOWLEDGEOS_MAX_UPLOAD_BYTES` | 512 MB | سقف حجم هر آپلود |
| `KNOWLEDGEOS_MAX_EXTRACTED_BYTES` | 64 MB | سقف متن استخراج‌شده از یک فایل |
| `KNOWLEDGEOS_MAX_BATCH_FILES` | اختیاری | سقف تعداد فایل در یک batch |
| `KNOWLEDGEOS_CHUNK_SIZE` | `1200` | اندازه تقریبی هر تکه متن (کاراکتر/توکن منطقی کد) |
| `KNOWLEDGEOS_CHUNK_OVERLAP` | `180` | همپوشانی بین تکه‌ها |
| `KNOWLEDGEOS_WORKERS` | `4` | تعداد workerهای پردازش job |
| `KNOWLEDGEOS_HOST` / `KNOWLEDGEOS_PORT` | bind سرور خارج Docker | اگر uvicorn مستقیم اجرا شود |
| `KNOWLEDGEOS_RERANK_TIMEOUT_MS` | اختیاری | مهلت rerank |

### Office / Excel

| متغیر | پیش‌فرض | معنی |
|--------|---------|------|
| `KNOWLEDGEOS_XLSX_MAX_ROWS` | `5000` | حداکثر ردیف خوانده‌شده از هر شیت Excel |
| `KNOWLEDGEOS_XLSX_MAX_COLS` | `50` | حداکثر ستون |

---

## ۱۰. کیفیت پاسخ، NLI و ارزیابی

| متغیر | پیش‌فرض | معنی |
|--------|---------|------|
| `KNOWLEDGEOS_NLI_ENABLED` | `true` | بررسی ادعاهای جواب نسبت به استناد |
| `KNOWLEDGEOS_NLI_MODEL` | اختیاری | مدل NLI |
| `KNOWLEDGEOS_NLI_THRESHOLD` | اختیاری | آستانه پذیرش ادعا |
| `KNOWLEDGEOS_NLI_MAX_CLAIMS` | اختیاری | سقف تعداد claim برای بررسی |

این‌ها جدا از فلگ درخواست `require_citations` هستند؛ آن فلگ از UI/API می‌آید نه لزوماً از `.env`.

---

## ۱۱. مهاجرت از SQLite قدیمی

| متغیر | معنی |
|--------|------|
| `KNOWLEDGEOS_SQLITE_SOURCE` | مسیر فایل SQLite قدیمی برای اسکریپت `migrate_sqlite.py` |
| `KNOWLEDGEOS_MIGRATE_VECTORS` | آیا بردارها هم به backend جدید منتقل شوند |

فقط برای مهاجرت یک‌باره؛ در runtime عادی لازم نیست.

---

## ۱۲. سه پروفایل پیشنهادی

### الف) توسعه روی لپ‌تاپ

```env
KNOWLEDGEOS_VECTOR_BACKEND=qdrant
KNOWLEDGEOS_OBJECT_STORE=local
KNOWLEDGEOS_ALLOW_ANONYMOUS=true
KNOWLEDGEOS_ALLOW_HASH_EMBEDDING_FALLBACK=false
KNOWLEDGEOS_OLLAMA_EMBEDDING_MODEL=all-minilm
KNOWLEDGEOS_CORS_ORIGINS=http://localhost:5173,http://localhost:5180
```

### ب) سازمانی کوچک (همه‌چیز روی Postgres)

```env
KNOWLEDGEOS_VECTOR_BACKEND=postgres
KNOWLEDGEOS_OBJECT_STORE=local
KNOWLEDGEOS_ALLOW_ANONYMOUS=false
KNOWLEDGEOS_AUTH_SECRET=یک-رشته-بلند-تصادفی
KNOWLEDGEOS_ARCHIVE_REPORTS=true
```

### ج) تولید با MinIO و Qdrant

```env
KNOWLEDGEOS_VECTOR_BACKEND=qdrant
KNOWLEDGEOS_OBJECT_STORE=minio
KNOWLEDGEOS_MINIO_SECURE=true
KNOWLEDGEOS_ALLOW_ANONYMOUS=false
KNOWLEDGEOS_AUTH_SECRET=...
KNOWLEDGEOS_ENCRYPTION_KEY=...
POSTGRES_PASSWORD=...
MINIO_ROOT_PASSWORD=...
KNOWLEDGEOS_CORS_ORIGINS=https://app.example.com
```

---

## ۱۳. اشتباهات رایج

1. **UI به API وصل نمی‌شود** → `KNOWLEDGEOS_CORS_ORIGINS` دامنه UI را ندارد.  
2. **بردار پیدا نمی‌شود** → `KNOWLEDGEOS_VECTOR_BACKEND` عوض شده بدون reindex.  
3. **Embedding خراب / جواب بی‌ربط** → `ALLOW_HASH_EMBEDDING_FALLBACK=true` روشن مانده یا Ollama مدل را ندارد.  
4. **آپلود بزرگ fail** → `MAX_UPLOAD_BYTES` یا محدودیت reverse proxy.  
5. **Postgres connection refused** → در Docker باید host نام سرویس باشد (`postgres`)، نه `localhost` از داخل کانتینر.  
6. **MinIO 403** → access/secret با `MINIO_ROOT_*` یکی نیست یا bucket ساخته نشده.

---

## ۱۴. چک‌لیست بعد از تغییر `.env`

1. `docker compose up -d --build` (اگر متغیر build-time نیست، گاهی فقط `up -d` کافی است).  
2. `curl http://localhost:8000/api/health`  
3. در پاسخ health، `vector_backend` و وضعیت DB را ببینید.  
4. یک سند کوچک آپلود و chat تست کنید.  
5. اگر backend بردار عوض شد، ایندکس را از نو بسازید.

---

## ۱۵. جمع‌بندی یک خطی

- **Postgres** همیشه هست (داده و متن).  
- **بردار** با `KNOWLEDGEOS_VECTOR_BACKEND`: پیش‌فرض **Qdrant**، جایگزین **pgvector**.  
- **فایل** با `KNOWLEDGEOS_OBJECT_STORE`: `local` یا **MinIO**.  
- **کش** با Redis.  
- **Embedding** پیش‌فرض با **Ollama**.  
- در تولید: anonymous را ببندید، رمزها را عوض کنید، CORS را محدود کنید.
