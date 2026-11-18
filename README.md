# Knowledge Web UI — React

فرانت‌اند React **مستقل** برای موتور `01-KnowledgeRAG`.

## استک

- React 18 + TypeScript
- Vite
- Tailwind CSS
- React Router
- Radix UI
- nginx (در Docker برای serve استاتیک)

## ساختار

```
02-KnowledgeWeb-React/
├── src/
│   ├── api/          ← کلاینت HTTP به RAG (/documents, /chat, …)
│   ├── pages/        ← صفحات: Chat, Documents, Indexes, Models, …
│   ├── components/   ← UI و Shell
│   └── lib/
├── public/
├── docker/nginx.conf
├── Dockerfile
├── docker-compose.yml
├── package.json
└── vite.config.ts
```

## اجرا محلی

```bash
# موتور RAG باید روی :8000 باشد
npm install
npm run dev
# http://localhost:5173
```

در dev، Vite مسیر `/api` را به `http://127.0.0.1:8000` پروکسی می‌کند.

اتصال مستقیم:

```bash
# .env.local
VITE_KNOWLEDGEOS_API_URL=http://localhost:8000
```

## Docker (مستقل)

```bash
docker compose up -d --build
# UI: http://localhost:5173
```

پیش‌فرض build با `VITE_KNOWLEDGEOS_API_URL=http://localhost:8000` است تا مرورگر به API روی ماشین میزبان بزند.  
اگر RAG هم در Docker و در شبکه مشترک است، آرگومان build را خالی بگذارید تا nginx داخل کانتینر `/api` را پروکسی کند (در آن حالت سرویس backend باید در همان شبکه با نام قابل resolve باشد).

## صفحات

Home, Documents, Chat, Indexes, Models, Storage, Sync, Activity, Evaluations, Performance, Settings, Auth, Dashboard
