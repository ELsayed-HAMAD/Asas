# Asas Enterprise Platform

![Asas Enterprise Platform](https://img.shields.io/badge/Status-Active_Development-success?style=flat-square)
![React](https://img.shields.io/badge/React-18-blue?style=flat-square&logo=react)
![TailwindCSS v4](https://img.shields.io/badge/TailwindCSS-v4-38B2AC?style=flat-square&logo=tailwind-css)
![Fastify](https://img.shields.io/badge/Fastify-4-black?style=flat-square&logo=fastify)

**Asas** is a modern, premium, tenant-aware enterprise operations platform. It brings HR, Finance, CRM, Inventory, and Projects into one unified, visually stunning dashboard. 

The platform is designed with a strict focus on top-tier professional aesthetics, leveraging a bespoke design system, Tailwind CSS v4, and a highly polished user experience.

---

## 🌟 Key Features

* **Premium UI/UX:** Built on a custom Tailwind v4 `@theme`, featuring tailored spacing, subtle hover states, micro-animations, and a completely custom, scrollbar-free sidebar navigation.
* **Tenant Isolation:** Fastify API with JWT authentication and strict tenant-level data boundaries.
* **Unified Workspace:** A single-page application (React + Vite) that seamlessly routes between distinct business modules.
* **Rapid Local Development:** Powered by Prisma and SQLite for zero-friction local setup and prototyping.

## 📦 Core Modules

* **HR & Payroll:** Employee directory, time & attendance tracking, payroll processing, and recruitment pipelines.
* **Finance:** Accounts payable/receivable, detailed expense tracking, and financial overviews.
* **CRM (Sales):** Deal pipelines, revenue forecasting, and sales performance leaderboards.
* **Projects:** Portfolio overview, active sprints, and product roadmaps.
* **Inventory:** Product catalogs, stock alerts, and warehouse management.
* **Settings:** Billing, integrations, data export, and general workspace configuration.

---

## 🏗️ Project Structure

```text
asas/   React + Vite Frontend (Tailwind v4)
api/    Fastify + Prisma Backend
```

---

## 🚀 Getting Started

To run the platform locally, you will need to start both the backend API and the frontend client.

### 1. Start the API

Open a terminal and navigate to the `api` directory:

```powershell
cd api
npm install
npm run db:generate
npm exec prisma db push
npm run dev
```

The API will start listening on `http://127.0.0.1:4000`.

### 2. Start the Frontend

Open a second terminal and navigate to the `asas` directory:

```powershell
cd asas
npm install
npm run dev
```

Open the Vite address shown in the terminal (usually `http://localhost:5173`) in your browser.

---

## 🔐 Configuration & Secret Safety

To configure the API, copy the provided environment template:

```powershell
Copy-Item api/.env.example api/.env
```

**Security Rules:**
- Never commit `api/.env` or `api/prisma/dev.db` (these are ignored by Git).
- `api/.env.example` and `api/prisma/schema.prisma` are safe to commit as they contain placeholders and database structure, not credentials or local data.
- Before production deployment, replace `JWT_SECRET` with a long, unique cryptographic secret and migrate from SQLite to a production-grade database like PostgreSQL.

---

## 💻 Useful Commands

| Location | Command | Purpose |
| --- | --- | --- |
| `api/` | `npm run dev` | Run the backend in watch mode |
| `api/` | `npm run db:generate` | Generate the Prisma client |
| `api/` | `npm run db:migrate` | Create and run a Prisma migration |
| `asas/` | `npm run dev` | Run the frontend locally |
| `asas/` | `npm run build` | Build the frontend for production |

---

## 📚 Documentation

API documentation, endpoint details, and detailed backend setup notes are available in [api/README.md](api/README.md).
