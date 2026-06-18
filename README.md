# THE ELEGANT — Backend API

REST API server for THE ELEGANT premium e-commerce platform, built with Express.js and MongoDB.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js (ES Modules) |
| Framework | Express.js v4 |
| Database | MongoDB Atlas via Mongoose |
| Authentication | JWT (jsonwebtoken) + bcryptjs |
| File Storage | Cloudinary + Multer |
| Payments | Razorpay |
| Email | Nodemailer (Gmail SMTP) |

---

## Project Structure

```
backend/
├── server.js              # Entry point — Express app, DB connection
├── middleware/
│   └── auth.js            # JWT verification middleware
├── models/
│   ├── User.js
│   ├── Product.js
│   └── Order.js
├── routes/
│   ├── auth.js            # Register, login, forgot/reset password
│   ├── products.js        # Product CRUD, image upload
│   ├── orders.js          # Order creation and management
│   ├── users.js           # User profile management
│   ├── dashboard.js       # Admin analytics endpoints
│   └── payment.js         # Razorpay order creation & verification
├── utils/
│   └── dbFallback.js      # In-memory store for offline operation
├── scripts/
│   └── seed.js            # Database seeder
└── uploads/               # Local file uploads (served as static)
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- MongoDB Atlas account (or local MongoDB)
- Cloudinary account
- Razorpay account (for payments)
- Gmail account with App Password (for emails)

### Installation

```bash
cd backend
npm install
```

### Environment Variables

Create a `.env` file in the `backend/` directory:

```env
# Server
PORT=5000

# MongoDB
MONGODB_URI=mongodb+srv://<user>:<password>@cluster.mongodb.net/luxe-ecom

# Authentication
JWT_SECRET=your_jwt_secret_key

# Cloudinary
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# Razorpay
RAZORPAY_KEY_ID=your_key_id
RAZORPAY_KEY_SECRET=your_key_secret

# Gmail SMTP
SMTP_EMAIL=your_gmail@gmail.com
SMTP_APP_PASSWORD=your_app_password

# Frontend URL (for password reset links)
CLIENT_URL=http://localhost:5173
```

### Running the Server

```bash
# Development (with hot reload)
npm run dev

# Production
npm start

# Seed the database with sample products
npm run seed
```

The server starts on `http://localhost:5000` by default.

---

## API Reference

### Authentication — `/api/auth`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/register` | Public | Create a new user account |
| POST | `/login` | Public | Login and receive JWT |
| GET | `/me` | Required | Get current user profile |
| POST | `/forgot-password` | Public | Send password reset email |
| POST | `/reset-password/:token` | Public | Reset password with token |

### Products — `/api/products`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/` | Public | List all products (supports filters) |
| GET | `/:id` | Public | Get single product |
| POST | `/` | Admin | Create product |
| PUT | `/:id` | Admin | Update product |
| DELETE | `/:id` | Admin | Delete product |

### Orders — `/api/orders`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/` | Required | Place a new order |
| GET | `/my-orders` | Required | Get current user's orders |
| GET | `/` | Admin | Get all orders |
| PUT | `/:id/status` | Admin | Update order status |

### Users — `/api/users`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/` | Admin | List all users |
| GET | `/:id` | Required | Get user by ID |
| PUT | `/:id` | Required | Update user profile |
| DELETE | `/:id` | Admin | Delete user |

### Payments — `/api/payment`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/create-order` | Required | Create Razorpay order |
| POST | `/verify` | Required | Verify payment signature |

### Dashboard — `/api/dashboard`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/stats` | Admin | Revenue, orders, users summary |
| GET | `/recent-orders` | Admin | Latest orders feed |

---

## Authentication

All protected routes require a Bearer token in the `Authorization` header:

```
Authorization: Bearer <your_jwt_token>
```

Admin-only routes additionally check that `user.role === 'admin'`.

---

## Offline Mode

If MongoDB Atlas is unreachable, the server starts anyway and falls back to an in-memory data store (`utils/dbFallback.js`). Data written in this mode is **not persisted** and resets on restart.

---

## Deployment

The server is stateless and can be deployed to any Node.js host (Railway, Render, Heroku, etc.). Ensure all environment variables are set in the host's dashboard before deploying.
