/**
 * create-backend.mjs (JS/.mjs PRODUCTION VERSION)
 *
 * ✅ Generates a production-ready ESM backend scaffold (.mjs only)
 * - DB: --db none | mongo | postgres
 * - Modules: --modules user,post
 *
 * ✅ Your requirements implemented:
 * - ✅ Mongo pagination file kept EXACTLY as you provided (mongoPaginate/isMongooseModel)
 * - ✅ NO pagination middleware usage in routes
 * - ✅ Controllers build: filter = {} and options = {} then call service
 * - ✅ Services call paginate (mongoPaginate for Mongo / prismaPaginate for Postgres)
 * - ✅ sendSuccess signature everywhere: sendSuccess(res, status, message, data)
 * - ✅ Services return block: { success, status, message, data }
 * - ✅ Each module includes Messages file: module.messages.mjs
 * - ✅ Prisma slow query logger included
 * - ✅ Mongoose slow query plugin included
 * - ✅ uploadMiddleware.mjs included (JS version)
 *
 * Examples:
 *  node .\generators\javaScript-backend.mjs my-api --db mongo --modules user,post
 *  node .\generators\javaScript-backend.mjs my-api --db postgres --modules user,post
 * 
 * TEST: 
 * node create-backend.mjs my-api --db postgres --modules user,post
 */

import fs from "fs";
import path from "path";

/* ---------------------------
   CLI args
---------------------------- */
const projectName = process.argv[2];
const modulesArg = getArgValue("--modules");
let modules = modulesArg
  ? modulesArg.split(",").map((m) => m.trim()).filter(Boolean)
  : [];

const db = (getArgValue("--db") || "none").toLowerCase(); // mongo | postgres | none
if (!["mongo", "postgres", "none"].includes(db)) {
  console.log("Invalid --db value. Use: mongo | postgres | none");
  process.exit(1);
}

if (!projectName) {
  console.log("Please provide project name");
  console.log("Example: node create-backend.mjs my-api --modules user,post --db mongo");
  process.exit(1);
}

// If DB is mongo/postgres, auth middleware expects a user module.
if ((db === "mongo" || db === "postgres") && !modules.includes("user")) {
  modules = ["user", ...modules];
}

const ext = "mjs";
const base = path.join(process.cwd(), projectName);

/* ---------------------------
   Helpers
---------------------------- */
function getArgValue(flag) {
  const i = process.argv.indexOf(flag);
  if (i === -1) return null;
  return process.argv[i + 1] ?? null;
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeFile(relPath, content) {
  const fullPath = path.join(base, relPath);
  ensureDir(path.dirname(fullPath));
  fs.writeFileSync(fullPath, content, "utf8");
}

function appendFile(relPath, content) {
  const fullPath = path.join(base, relPath);
  ensureDir(path.dirname(fullPath));
  fs.appendFileSync(fullPath, content, "utf8");
}

function toKebab(str) {
  return str
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replace(/[\s_]+/g, "-")
    .toLowerCase();
}

function toCamel(str) {
  const s = str.replace(/[-_\s]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ""));
  return s.charAt(0).toLowerCase() + s.slice(1);
}

function toPascal(str) {
  const c = toCamel(str);
  return c.charAt(0).toUpperCase() + c.slice(1);
}

function pluralize(name) {
  if (name.endsWith("s")) return name;
  if (name.endsWith("y")) return name.slice(0, -1) + "ies";
  return name + "s";
}

/* ---------------------------
   Base folders
---------------------------- */
const folders = [
  "src/config",
  "src/modules",
  "src/middlewares",
  "src/utils",
  "src/types",
  "uploads",
];
folders.forEach((folder) => ensureDir(path.join(base, folder)));
if (db === "postgres") ensureDir(path.join(base, "prisma"));

/* ---------------------------
   Slow Query Loggers
---------------------------- */
const mongooseSlowQueriesFile = `import { logger } from "../utils/logger.${ext}";
import { getCtx } from "../utils/context.${ext}";

export default function logSlowQueries(thresholdMs = 200) {
  return function (schema) {
    schema.pre(/^find|count|update|delete|aggregate|findById|findOneAnd|insertMany/, function () {
      this._startAt = Date.now();
    });

    schema.post(/^find|count|update|delete|aggregate|findById|findOneAnd|insertMany/, function () {
      const ms = Date.now() - (this._startAt || Date.now());

      if (ms > thresholdMs) {
        logger.warn({
          event: "db_slow_query",
          model: this.model?.modelName,
          op: this.op,
          cond: this.getQuery?.(),
          options: this.getOptions?.(),
          ms,
          ...getCtx(),
        });
      }
    });

    schema.pre("save", function () {
      this._startAt = Date.now();
    });

    schema.post("save", function () {
      const ms = Date.now() - (this._startAt || Date.now());

      if (ms > thresholdMs) {
        logger.warn({
          event: "db_slow_save",
          model: this.constructor?.modelName,
          id: this._id,
          ms,
          ...getCtx(),
        });
      }
    });
  };
}
`;

const prismaSlowQueriesFile = `import { logger } from "../utils/logger.${ext}";

export const attachPrismaSlowQueryLogger = (prisma, thresholdMs = 200) => {
  prisma.$use(async (params, next) => {
    const start = Date.now();
    try {
      const result = await next(params);
      const ms = Date.now() - start;

      if (ms > thresholdMs) {
        logger.warn({
          event: "db_slow_query",
          orm: "prisma",
          model: params.model,
          action: params.action,
          ms,
        });
      }

      return result;
    } catch (err) {
      const ms = Date.now() - start;
      logger.error({
        event: "db_query_error",
        orm: "prisma",
        model: params.model,
        action: params.action,
        ms,
        err,
        message: err?.message,
      });
      throw err;
    }
  });
};
`;

/* ---------------------------
   DB config templates
---------------------------- */
const dbConfigFile =
  db === "mongo"
    ? `import mongoose from "mongoose";
import env from "./env.${ext}";
import logSlowQueries from "./logSlowQueries.${ext}";
import { logger } from "../utils/logger.${ext}";

mongoose.plugin(logSlowQueries(Number(env.SLOW_QUERY_MS || 200)));

export const connectDB = async () => {
  if (!env.MONGO_URI) throw new Error("MONGO_URI is missing");

  mongoose.set("strictQuery", true);

  try {
    await mongoose.connect(env.MONGO_URI, {
      autoIndex: env.NODE_ENV === "development",
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });

    logger.info({ event: "mongoose_connected", db: "mongo" });
  } catch (err) {
    logger.error({
      event: "mongoose_connection_failed",
      error: err?.message,
      stack: err?.stack,
      message: "MongoDB failed to connect. Retrying in 5 seconds...",
    });

    if (env.NODE_ENV !== "production") setTimeout(connectDB, 5000);
    else process.exit(1);
  }
};

const handleExit = (signal) => {
  logger.info({ event: "mongoose_connection_close", signal });

  mongoose.connection
    .close()
    .then(() => {
      logger.info({ event: "mongoose_connection_closed" });
      process.exit(0);
    })
    .catch((err) => {
      logger.error({
        event: "mongoose_connection_close_error",
        error: err?.message,
        stack: err?.stack,
      });
      process.exit(1);
    });
};

process.on("SIGINT", handleExit);
process.on("SIGTERM", handleExit);
`
    : db === "postgres"
      ? `import { PrismaClient } from "@prisma/client";
import env from "./env.${ext}";
import { logger } from "../utils/logger.${ext}";
import { attachPrismaSlowQueryLogger } from "./slowQueriesPrisma.${ext}";

export const prisma = new PrismaClient();

attachPrismaSlowQueryLogger(prisma, Number(env.SLOW_QUERY_MS || 200));

export const connectDB = async () => {
  await prisma.$connect();
  logger.info({ event: "db_connected", db: "postgres" });
};
`
      : `export const connectDB = async () => {
  return;
};
`;

const serverFile =
  db === "mongo" || db === "postgres"
    ? `import app from "./src/app.${ext}";
import env from "./src/config/env.${ext}";
import { connectDB } from "./src/config/db.${ext}";

const PORT = env.PORT || 5000;

await connectDB();

app.listen(PORT, () => {
  console.log(\`Server running on \${PORT}\`);
});
`
    : `import app from "./src/app.${ext}";
import env from "./src/config/env.${ext}";

const PORT = env.PORT || 5000;

app.listen(PORT, () => {
  console.log(\`Server running on \${PORT}\`);
});
`;

/* ---------------------------
   Auth middleware template (DB-aware)
---------------------------- */
function authMiddlewareTemplate() {
  if (db === "mongo") {
    return `import jwt from "jsonwebtoken";
import errorResponse from "../utils/errorResponse.${ext}";
import { bindToContext, getCtx } from "../utils/context.${ext}";
import { logger } from "../utils/logger.${ext}";
import env from "../config/env.${ext}";
import UserModel from "../modules/user/user.schema.${ext}";

export const protect = async (req, res, next) => {
  let token;

  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer ")) token = auth.split(" ")[1];

  if (!token) {
    logger.warn({ event: "auth_missing_token", path: req.originalUrl, ...getCtx() });
    return next(new errorResponse("Not authorized to access this route, token missing", 401));
  }

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET);

    if (decoded.exp && decoded.exp < Math.floor(Date.now() / 1000)) {
      logger.warn({ event: "auth_token_expired", sub: decoded.sub, ...getCtx() });
      return next(new errorResponse("Token has expired", 401));
    }

    const user = await UserModel.findOne({ _id: decoded.sub, isDeleted: false }).lean();
    if (!user) {
      logger.warn({ event: "auth_user_not_found", sub: decoded.sub, ...getCtx() });
      return next(new errorResponse("Not authorized to access this route, user not found", 401));
    }

    req.user = user;
    req.token = token;
    req.tokenData = decoded;

    bindToContext({ userId: String(user._id), role: user.role });

    logger.debug({ event: "auth_ok", sub: decoded.sub, role: user.role, ...getCtx() });
    next();
  } catch (err) {
    if (err?.name === "TokenExpiredError") {
      logger.warn({ event: "auth_token_expired_throw", message: err.message, ...getCtx() });
      return next(new errorResponse("Token expired, please log in again", 401));
    }

    if (err?.name === "JsonWebTokenError") {
      logger.warn({ event: "auth_invalid_token", message: err.message, ...getCtx() });
      return next(new errorResponse("Invalid token, please log in again", 401));
    }

    logger.error({ event: "auth_error", err, stack: err?.stack, ...getCtx() });
    return next(new errorResponse("Not authorized to access this route", 401));
  }
};

export const authorize = (...roles) => (req, res, next) => {
  if (!req.user?.role || !roles.includes(req.user.role)) {
    logger.warn({
      event: "authz_denied",
      required: roles,
      role: req.user?.role,
      path: req.originalUrl,
      ...getCtx(),
    });
    return next(new errorResponse(\`Access denied: role \${req.user?.role} not allowed\`, 403));
  }
  next();
};
`;
  }

  if (db === "postgres") {
    return `import jwt from "jsonwebtoken";
import errorResponse from "../utils/errorResponse.${ext}";
import { bindToContext, getCtx } from "../utils/context.${ext}";
import { logger } from "../utils/logger.${ext}";
import env from "../config/env.${ext}";
import { prisma } from "../config/db.${ext}";

export const protect = async (req, res, next) => {
  let token;

  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer ")) token = auth.split(" ")[1];

  if (!token) {
    logger.warn({ event: "auth_missing_token", path: req.originalUrl, ...getCtx() });
    return next(new errorResponse("Not authorized to access this route, token missing", 401));
  }

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET);

    if (decoded.exp && decoded.exp < Math.floor(Date.now() / 1000)) {
      logger.warn({ event: "auth_token_expired", sub: decoded.sub, ...getCtx() });
      return next(new errorResponse("Token has expired", 401));
    }

    const user = await prisma.user.findUnique({ where: { id: decoded.sub } });

    if (!user || user.isDeleted) {
      logger.warn({ event: "auth_user_not_found", sub: decoded.sub, ...getCtx() });
      return next(new errorResponse("Not authorized to access this route, user not found", 401));
    }

    req.user = user;
    req.token = token;
    req.tokenData = decoded;

    bindToContext({ userId: String(user.id), role: user.role });

    logger.debug({ event: "auth_ok", sub: decoded.sub, role: user.role, ...getCtx() });
    next();
  } catch (err) {
    if (err?.name === "TokenExpiredError") {
      logger.warn({ event: "auth_token_expired_throw", message: err.message, ...getCtx() });
      return next(new errorResponse("Token expired, please log in again", 401));
    }

    if (err?.name === "JsonWebTokenError") {
      logger.warn({ event: "auth_invalid_token", message: err.message, ...getCtx() });
      return next(new errorResponse("Invalid token, please log in again", 401));
    }

    logger.error({ event: "auth_error", err, stack: err?.stack, ...getCtx() });
    return next(new errorResponse("Not authorized to access this route", 401));
  }
};

export const authorize = (...roles) => (req, res, next) => {
  if (!req.user?.role || !roles.includes(req.user.role)) {
    logger.warn({
      event: "authz_denied",
      required: roles,
      role: req.user?.role,
      path: req.originalUrl,
      ...getCtx(),
    });
    return next(new errorResponse(\`Access denied: role \${req.user?.role} not allowed\`, 403));
  }
  next();
};
`;
  }

  return `import errorResponse from "../utils/errorResponse.${ext}";

export const protect = async (_req, _res, next) => {
  return next(new errorResponse("Auth middleware requires --db mongo or --db postgres", 500));
};

export const authorize = (..._roles) => (_req, _res, next) => {
  return next(new errorResponse("Auth middleware requires --db mongo or --db postgres", 500));
};
`;
}

/* ---------------------------
   Error middleware template (DB-aware)
---------------------------- */
function errorMiddlewareTemplate() {
  const commonTail = `
  // JWT errors
  if (err?.name === "JsonWebTokenError") {
    status = 401;
    message = "Invalid token";
    data = { type: "JsonWebTokenError" };
  }
  if (err?.name === "TokenExpiredError") {
    status = 401;
    message = "Token expired";
    data = { type: "TokenExpiredError" };
  }

  // Multer errors
  if (err?.name === "MulterError" || err?.code?.startsWith?.("LIMIT_")) {
    status = err?.code === "LIMIT_FILE_SIZE" ? 413 : 400;
    message = err?.message || "Upload failed";
    data = { type: "MulterError", code: err?.code };
  }

  if (err?.code && !data?.type) {
    data = { ...data, type: "UploadError", code: err.code };
    if (!err?.status) status = 400;
  }

  // Common FS errors
  if (err?.code === "ENOENT") {
    status = 400;
    message = "Upload directory does not exist on the server.";
    data = { ...data, type: "FsError", code: err.code, reason: "PATH_NOT_FOUND" };
  } else if (err?.code === "EACCES") {
    status = 403;
    message = "The server does not have permission to write to the upload directory.";
    data = { ...data, type: "FsError", code: err.code, reason: "INSUFFICIENT_PERMISSIONS" };
  } else if (err?.code === "EPERM") {
    status = 403;
    message = "Operation not permitted on the upload directory.";
    data = { ...data, type: "FsError", code: err.code, reason: "OPERATION_NOT_PERMITTED" };
  }

  // CORS callback errors
  if (message === "Blocked by CORS") {
    status = 403;
    data = { ...data, type: "CorsError", origin: req.headers.origin };
  }

  const level = status >= 500 ? "error" : "warn";
  logger[level]({
    event: "http_error",
    status,
    name: err?.name,
    message,
    code: err?.code,
    path: req.originalUrl,
    method: req.method,
    dataType: data?.type,
    stack: env.NODE_ENV !== "production" ? err?.stack : undefined,
    ...getCtx(),
  });

  return res.status(status).json({
    success: false,
    status,
    message,
    data,
  });
};`;

  if (db === "mongo") {
    return `import env from "../config/env.${ext}";
import { getCtx } from "../utils/context.${ext}";
import { logger } from "../utils/logger.${ext}";

export const errorMiddleware = (err, req, res, next) => {
  let status = err?.status || 500;
  let message = err?.message || err?.code || "Internal Server Error";
  let data = err?.data || {};

  if (env.NODE_ENV !== "production") {
    console.error(err?.stack);
  }

  // Mongoose bad ObjectId
  if (err?.name === "CastError") {
    status = 404;
    message = \`Resource not found with id \${err?.value}\`;
    data = { type: "CastError", value: err?.value };
  }

  // Mongoose duplicate key
  if (err?.code === 11000 || err?.code === "DuplicateKey") {
    const keys = Object.keys(err?.keyValue || {});
    const values = Object.values(err?.keyValue || {});
    status = 400;
    message =
      "A record with the same information already exists. Please try again with different values.";
    data = { type: "DuplicateKeyError", keys, values };
  }

  // Mongoose validation error
  if (err?.name === "ValidationError") {
    const messages = Object.values(err?.errors || {}).map((val) => val?.message);
    const fields = Object.keys(err?.errors || {});
    status = 400;
    message = messages.filter(Boolean).join(", ") || "Validation failed";
    data = { type: "MongooseDBValidationError", fields };
  }

${commonTail}
`;
  }

  if (db === "postgres") {
    return `import env from "../config/env.${ext}";
import { getCtx } from "../utils/context.${ext}";
import { logger } from "../utils/logger.${ext}";

export const errorMiddleware = (err, req, res, next) => {
  let status = err?.status || 500;
  let message = err?.message || err?.code || "Internal Server Error";
  let data = err?.data || {};

  if (env.NODE_ENV !== "production") {
    console.error(err?.stack);
  }

  const isPrisma =
    typeof err?.name === "string" &&
    (err.name.includes("Prisma") || String(err?.code || "").startsWith("P"));

  if (isPrisma) {
    if (err?.code === "P2002") {
      status = 409;
      message =
        "A record with the same information already exists. Please try again with different values.";
      data = { type: "PrismaUniqueConstraintError", code: err.code, target: err?.meta?.target };
    } else if (err?.code === "P2025") {
      status = 404;
      message = "Record not found";
      data = { type: "PrismaNotFoundError", code: err.code, meta: err?.meta };
    } else if (err?.name === "PrismaClientValidationError") {
      status = 400;
      message = "Validation failed. Please verify input and try again.";
      data = { type: "PrismaClientValidationError" };
    } else if (err?.name === "PrismaClientInitializationError") {
      status = 500;
      message = "Database connection failed. Please try again.";
      data = { type: "PrismaClientInitializationError" };
    } else {
      status = status || 400;
      message = message || "Database error";
      data = { type: "PrismaError", name: err?.name, code: err?.code, meta: err?.meta };
    }
  }

${commonTail}
`;
  }

  return `import env from "../config/env.${ext}";
import { getCtx } from "../utils/context.${ext}";
import { logger } from "../utils/logger.${ext}";

export const errorMiddleware = (err, req, res, next) => {
  let status = err?.status || 500;
  let message = err?.message || err?.code || "Internal Server Error";
  let data = err?.data || {};

  if (env.NODE_ENV !== "production") {
    console.error(err?.stack);
  }

${commonTail}
`;
}

/* ---------------------------
   Mongo pagination file (EXACT AS YOU PROVIDED)
---------------------------- */
function mongoPaginationFileExact() {
  return `export const escapeRegExp = (s = "") => {
  // safe escape without parser issues
  return String(s).replace(/[.*+?^$()|[\\]\\\\]/g, "\\\\$&");
}

export async function mongoPaginate(model, filter = {}, options = {}, skipPagination = false) {
  const findFilter = { ...(filter || {}) };

  // --- search (regex OR across fields)
  if (options?.search && Array.isArray(options.searchFields) && options.searchFields.length) {
    const value = String(options.search).trim();
    if (value) {
      const mode = options.searchMode === "startsWith" ? "^" : ""; // default contains
      const regex = new RegExp(\`\${mode}\${escapeRegExp(value)}\`, "i");
      findFilter.$or = (findFilter.$or || []).concat(options.searchFields.map((f) => ({ [f]: regex })));
    }
  }

  // --- sort
  let sort = "";
  if (options?.sortBy) {
    const pieces = String(options.sortBy).split(",");
    const fields = [];
    for (const p of pieces) {
      const [key, order] = p.split(":");
      // "-" means descending, otherwise ascending (no sign)
      fields.push((order && order.toLowerCase() === "desc" ? "-" : "") + key);
    }
    sort = fields.join(" ");
  } else {
    // ✅ Correct fallback — Mongoose expects "-createdAt" not "createdAt:desc"
    sort = "-createdAt";
  }

  const limit = options?.limit && parseInt(options.limit, 10) > 0 ? parseInt(options.limit, 10) : 10;
  const page = options?.page && parseInt(options.page, 10) > 0 ? parseInt(options.page, 10) : 1;
  const skip = (page - 1) * limit;

  const countPromise = model.countDocuments(findFilter).exec();

  let q = model.find(findFilter).sort(sort);
  if (!skipPagination) q = q.skip(skip).limit(limit);

  if (options?.select) q = q.select(options.select);

  if (options?.populate) {
    const populates = Array.isArray(options.populate)
      ? options.populate.filter(Boolean)
      : String(options.populate)
          .split(",")
          .map((p) => p.trim())
          .filter(Boolean);

    for (const pop of populates) {
      if (typeof pop === "string") {
        // dot-path string → nested populate objects
        const nested = pop.split(".").reduceRight((acc, path) => (acc ? { path, populate: acc } : { path }), null);
        q = q.populate(nested);
      } else if (pop && typeof pop === "object") {
        q = q.populate(pop);
      }
    }
  }

  // keep toJSON compatibility if your docs have custom toJSON; otherwise lean()
  const [totalResults, docs] = await Promise.all([countPromise, q.exec()]);
  const totalPages = skipPagination ? 0 : Math.ceil(totalResults / limit);

  const data = docs.map(
    (doc) =>
      options?.currentUserId && typeof doc.toJSON === "function"
        ? doc.toJSON({ currentUserId: options.currentUserId })
        : typeof doc.toJSON === "function"
        ? doc.toJSON()
        : doc // handles lean false
  );

  return { data, page, limit, totalPages, totalResults };
}

// tiny type check
export function isMongooseModel(m) {
  return !!(m && typeof m.find === "function" && m.collection);
}
`;
}

/* ---------------------------
   Prisma paginate helper (service usage)
---------------------------- */
function prismaPaginateFile() {
  return `const parseSort = (sortBy) => {
  if (!sortBy) return [{ createdAt: "desc" }];

  const pieces = String(sortBy)
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);

  const orderBy = [];
  for (const p of pieces) {
    const [field, order] = p.split(":");
    if (!field) continue;
    orderBy.push({
      [field]: (order || "desc").toLowerCase() === "asc" ? "asc" : "desc",
    });
  }

  return orderBy.length ? orderBy : [{ createdAt: "desc" }];
};

export const prismaPaginate = async (delegate, filter = {}, options = {}, skipPagination = false) => {
  const where = { ...(filter || {}) };
  const opts = { ...(options || {}) };

  if (opts?.search && Array.isArray(opts.searchFields) && opts.searchFields.length) {
    const raw = String(opts.search).trim();
    if (raw) {
      const mode = opts.searchMode === "startsWith" ? "startsWith" : "contains";
      const searchGroup = {
        OR: opts.searchFields.map((f) => ({
          [f]: { [mode]: raw, mode: "insensitive" },
        })),
      };

      if (where.AND) {
        where.AND = Array.isArray(where.AND) ? [...where.AND, searchGroup] : [where.AND, searchGroup];
      } else {
        where.AND = [searchGroup];
      }
    }
  }

  const limit = opts?.limit && parseInt(opts.limit, 10) > 0 ? parseInt(opts.limit, 10) : 10;
  const page = opts?.page && parseInt(opts.page, 10) > 0 ? parseInt(opts.page, 10) : 1;
  const skip = (page - 1) * limit;

  const orderBy = opts?.orderBy || parseSort(opts?.sortBy);
  const include = opts?.include || undefined;
  const select = opts?.select || undefined;

  const [totalResults, rows] = await Promise.all([
    delegate.count({ where }),
    skipPagination
      ? delegate.findMany({ where, orderBy, include, select })
      : delegate.findMany({ where, orderBy, include, select, take: limit, skip }),
  ]);

  const totalPages = skipPagination ? 0 : Math.ceil(totalResults / limit);
  return { data: rows, page, limit, totalPages, totalResults };
};
`;
}

/* ---------------------------
   uploadMiddleware template (JS)
---------------------------- */
function uploadMiddlewareTemplate() {
  return `import multer from "multer";
import mimetype from "mime-types";
import path from "path";
import fs from "fs";

const limits = {
  imageSize: 5 * 1024 * 1024, // 5MB
  videoSize: 500 * 1024 * 1024, // 500MB
  pdfSize: 10 * 1024 * 1024, // 10MB
  vectorSize: 20 * 1024 * 1024, // 20MB
  mediaSize: 500 * 1024 * 1024, // 500MB
};

const codedError = (code, status = 400, extra = {}) => {
  const e = new Error();
  return Object.assign(e, { code, status, ...extra });
};

const forwardMulter = (mw) => (req, res, next) => {
  mw(req, res, (e) => next(e));
};

const imageFilter = (req, file, cb) => {
  if (file.mimetype?.startsWith("image/")) return cb(null, true);
  return cb(
    codedError("IMAGE_INVALID_MIMETYPE", 400, {
      field: file.fieldname,
      mimetype: file.mimetype,
      allowedPrefix: "image/",
    }),
    false
  );
};

const videoFilter = (req, file, cb) => {
  if (file.mimetype?.startsWith("video/")) return cb(null, true);
  return cb(
    codedError("VIDEO_INVALID_MIMETYPE", 400, {
      field: file.fieldname,
      mimetype: file.mimetype,
      allowedPrefix: "video/",
    }),
    false
  );
};

const pdfFilter = (req, file, cb) => {
  if (file.mimetype?.startsWith("application/pdf")) return cb(null, true);
  return cb(
    codedError("PDF_INVALID_MIMETYPE", 400, {
      field: file.fieldname,
      mimetype: file.mimetype,
      allowedPrefix: "application/pdf",
    }),
    false
  );
};

const imageVideoFilter = (req, file, cb) => {
  if (file.mimetype?.startsWith("image/") || file.mimetype?.startsWith("video/"))
    return cb(null, true);

  return cb(
    codedError("IMAGE_VIDEO_INVALID_MIMETYPE", 400, {
      field: file.fieldname,
      mimetype: file.mimetype,
      allowedPrefix: "image/ or video/",
    }),
    false
  );
};

const imagePDFFilter = (req, file, cb) => {
  if (file.mimetype?.startsWith("image/") || file.mimetype?.startsWith("application/pdf"))
    return cb(null, true);

  return cb(
    codedError("IMAGE_PDF_INVALID_MIMETYPE", 400, {
      field: file.fieldname,
      mimetype: file.mimetype,
      allowedPrefix: "image/ or application/pdf",
    }),
    false
  );
};

const ensureDir = (dirPath) => {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let uploadPath;

    if (file.mimetype.startsWith("image/")) {
      uploadPath = path.join(path.resolve(), "uploads", "images");
    } else if (file.mimetype.startsWith("video/")) {
      uploadPath = path.join(path.resolve(), "uploads", "videos");
    } else if (!file.mimetype.startsWith("image/") && !file.mimetype.startsWith("video/")) {
      uploadPath = path.join(path.resolve(), "uploads", "docs");
    } else {
      return cb(
        codedError("FILE_INVALID_MIMETYPE", 400, {
          field: file.fieldname,
          mimetype: file.mimetype,
        }),
        ""
      );
    }

    ensureDir(uploadPath);
    cb(null, uploadPath);
  },

  filename: (req, file, cb) => {
    const ext = mimetype.extension(file.mimetype) || "bin";
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9) + "." + ext;
    cb(null, \`\${file.fieldname}-\${uniqueSuffix}\`);
  },
});

const uploadImage = multer({
  storage,
  fileFilter: imageFilter,
  limits: { fileSize: limits.imageSize },
});

const uploadVideo = multer({
  storage,
  fileFilter: videoFilter,
  limits: { fileSize: limits.videoSize },
});

const uploadPDFDOC = multer({
  storage,
  fileFilter: pdfFilter,
  limits: { fileSize: limits.pdfSize },
});

const uploadImageVideo = multer({
  storage,
  fileFilter: imageVideoFilter,
  limits: { fileSize: limits.imageSize + limits.videoSize },
});

const uploadImagePDF = multer({
  storage,
  fileFilter: imagePDFFilter,
  limits: { fileSize: limits.imageSize + limits.pdfSize },
});

export const uploadSingleImage = (field) => forwardMulter(uploadImage.single(field));
export const uploadArrayImage = (field) => forwardMulter(uploadImage.array(field));
export const uploadMultpleImageFields = (fields) => forwardMulter(uploadImage.fields(fields));

export const uploadSingleVideo = (field) => forwardMulter(uploadVideo.single(field));
export const uploadArrayVideo = (field) => forwardMulter(uploadVideo.array(field));
export const uploadMultpleVideoFields = (fields) => forwardMulter(uploadVideo.fields(fields));

export const uploadSinglePDF = (field) => forwardMulter(uploadPDFDOC.single(field));
export const uploadArrayPDF = (field) => forwardMulter(uploadPDFDOC.array(field));
export const uploadMultplePDFFields = (fields) => forwardMulter(uploadPDFDOC.fields(fields));

export const uploadSingleImageVideo = (field) => forwardMulter(uploadImageVideo.single(field));
export const uploadArrayImageVideo = (field) => forwardMulter(uploadImageVideo.array(field));
export const uploadMultpleImageVideoFields = (fields) =>
  forwardMulter(uploadImageVideo.fields(fields));

export const uploadSingleImagePDF = (field) => forwardMulter(uploadImagePDF.single(field));
export const uploadArrayImagePDF = (field) => forwardMulter(uploadImagePDF.array(field));
export const uploadMultpleImagePDFFields = (fields) => forwardMulter(uploadImagePDF.fields(fields));

export default {
  uploadSingleImage,
  uploadArrayImage,
  uploadMultpleImageFields,
  uploadSingleVideo,
  uploadArrayVideo,
  uploadMultpleVideoFields,
  uploadSinglePDF,
  uploadArrayPDF,
  uploadMultplePDFFields,
  uploadSingleImageVideo,
  uploadArrayImageVideo,
  uploadMultpleImageVideoFields,
  uploadSingleImagePDF,
  uploadArrayImagePDF,
  uploadMultpleImagePDFFields,
};
`;
}

/* ---------------------------
   Shared files
---------------------------- */
const sharedFiles = {
  [`src/app.${ext}`]: `import express from "express";
import routes from "./routes.${ext}";
import { requestContext } from "./utils/context.${ext}";
import requestLogger from "./middlewares/requestLogger.${ext}";
import { errorMiddleware } from "./middlewares/errorMiddleware.${ext}";

const app = express();

app.use(requestContext);
app.use(requestLogger);
app.use(express.json());

app.get("/health", (req, res) => res.json({ ok: true }));

app.use("/api", routes);
app.use(errorMiddleware);

export default app;
`,

  [`src/routes.${ext}`]: `import { Router } from "express";
const router = Router();

// modules will be mounted here by the generator

export default router;
`,

  [`src/config/env.${ext}`]: `import "dotenv/config";

export default {
  PORT: process.env.PORT || 3000,
  NODE_ENV: process.env.NODE_ENV || "development",

  SQL_URL: process.env.SQL_URL,
  DB_DIALECT: process.env.DB_DIALECT,
  MONGO_URI: process.env.MONGO_URI,

  JWT_SECRET: process.env.JWT_SECRET,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "1d",

  LOG_LEVEL: process.env.LOG_LEVEL || "info",
  COMMIT_SHA: process.env.COMMIT_SHA,
  SLOW_QUERY_MS: process.env.SLOW_QUERY_MS,
};
`,

  [`src/config/db.${ext}`]: dbConfigFile,

  ...(db === "mongo" ? { [`src/config/logSlowQueries.${ext}`]: mongooseSlowQueriesFile } : {}),
  ...(db === "postgres"
    ? {
        [`src/config/slowQueriesPrisma.${ext}`]: prismaSlowQueriesFile,
      }
    : {}),

  [`src/utils/context.${ext}`]: `import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

const als = new AsyncLocalStorage();

export const getCtx = () => als.getStore() || {};

export const requestContext = (req, res, next) => {
  const requestId = req.get("x-request-id") || randomUUID();
  const ctx = {
    requestId,
    ip: req.ip,
    ua: req.get("user-agent"),
  };

  als.run(ctx, () => {
    res.setHeader("x-request-id", requestId);
    next();
  });
};

export const bindToContext = (patch = {}) => {
  const store = als.getStore();
  if (store) Object.assign(store, patch);
};
`,

  [`src/middlewares/requestLogger.${ext}`]: `import { logger } from "../utils/logger.${ext}";
import { getCtx } from "../utils/context.${ext}";

export default function requestLogger(req, res, next) {
  const start = process.hrtime.bigint();
  const { method, originalUrl } = req;

  logger.info({ event: "request_start", method, url: originalUrl, ...getCtx() });

  res.on("finish", () => {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    logger.info({
      event: "request_end",
      method,
      url: originalUrl,
      status: res.statusCode,
      ms: Math.round(ms),
      contentLength: res.getHeader("content-length"),
      ...getCtx(),
    });
  });

  next();
}
`,

  [`src/utils/logger.${ext}`]: `import pino from "pino";
import env from "../config/env.${ext}";

const isDev = env.NODE_ENV !== "production";

export const logger = pino({
  level: env.LOG_LEVEL || (isDev ? "debug" : "info"),
  base: {
    service: "api",
    env: env.NODE_ENV,
    commit: env.COMMIT_SHA,
  },
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "password",
      "req.body.password",
      "req.body.resetToken",
      "token",
    ],
    remove: true,
  },
  transport: isDev
    ? {
        target: "pino-pretty",
        options: { colorize: true, translateTime: "SYS:standard" },
      }
    : undefined,
  serializers: { err: pino.stdSerializers.err },
  timestamp: pino.stdTimeFunctions.isoTime,
});
`,

  [`src/utils/asyncHandler.${ext}`]: `import { logger } from "./logger.${ext}";
import { getCtx } from "./context.${ext}";

export const asyncHandler = (fn, meta) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch((err) => {
    if (meta) {
      logger.error({
        event: "controller_err",
        ...meta,
        err,
        stack: err?.stack,
        ...getCtx(),
      });
    }
    next(err);
  });
`,

  // ✅ sendSuccess signature updated (your requirement)
  [`src/utils/globalResponse.${ext}`]: `export const sendSuccess = (res, statusCode = 200, message = "Success", data = {}) => {
  return res.status(statusCode).json({
    success: true,
    status: statusCode,
    message,
    data,
  });
};
`,

  [`src/utils/errorResponse.${ext}`]: `class errorResponse extends Error {
  constructor(message, status, data = {}) {
    super(message);
    this.status = status;
    this.data = data;

    Error.captureStackTrace(this, this.constructor);
  }
}

export default errorResponse;
`,

  // ✅ Validate middleware (kept)
  [`src/middlewares/validate.${ext}`]: `import { z } from "zod";
import Response from "../utils/errorResponse.${ext}";
import { logger } from "../utils/logger.${ext}";

export const validate = (schema = {}) => (req, res, next) => {
  try {
    if (schema.body) {
      const hasBody = isNonEmptyPlainObject(req.body);
      const hasFile = !!req.file;
      const hasFiles = !!req.files && !isEmptyFiles(req.files);

      if (!hasBody && !hasFile && !hasFiles) {
        return next(new Response("One or more fields are required", 400));
      }

      const result = schema.body.safeParse(req.body ?? {});
      if (!result.success) return handleZodError(result.error, next);
      req.body = result.data;
    }

    if (schema.params) {
      const result = schema.params.safeParse(req.params ?? {});
      if (!result.success) return handleZodError(result.error, next);
      req.params = result.data;
    }

    if (schema.query) {
      const result = schema.query.safeParse(req.query ?? {});
      if (!result.success) return handleZodError(result.error, next);
      req.query = result.data;
    }

    if (schema.file) {
      const incomingFile = req.file;
      if (!incomingFile) {
        return next(new Response("Media file is required", 400));
      }
      const result = schema.file.safeParse(incomingFile);
      if (!result.success) return handleZodError(result.error, next);
      req.file = result.data;
    }

    if (schema.files) {
      const incomingFiles = req.files;
      if (incomingFiles && !isEmptyFiles(incomingFiles)) {
        const result = schema.files.safeParse(incomingFiles);
        if (!result.success) return handleZodError(result.error, next);
        req.files = result.data;
      }
    }

    next();
  } catch (error) {
    logger.warn({
      event: "validation_error",
      path: req.originalUrl,
      method: req.method,
      body: req.body,
      query: req.query,
      params: req.params,
      files: req.files,
      message: error?.message,
      stack: error?.stack,
    });

    next(error);
  }
};

const handleZodError = (error, next) => {
  if (error instanceof z.ZodError) {
    const details = error.issues.map((e) => ({
      path: e.path?.length ? e.path.join(".") : "",
      message: e.message,
    }));
    return next(new Response("Validation Error", 400, details));
  }
  return next(error);
};

const isNonEmptyPlainObject = (value) => {
  return value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length > 0;
};

const isEmptyFiles = (files) => {
  if (Array.isArray(files)) return files.length === 0;

  if (files && typeof files === "object") {
    return Object.values(files).every((arr) => !Array.isArray(arr) || arr.length === 0);
  }

  return true;
};
`,

  [`src/middlewares/auth.${ext}`]: authMiddlewareTemplate(),
  [`src/middlewares/errorMiddleware.${ext}`]: errorMiddlewareTemplate(),

  // ✅ Pagination files
  ...(db === "mongo" ? { [`src/middlewares/paginationMiddleware.${ext}`]: mongoPaginationFileExact() } : {}),
  ...(db === "postgres" ? { [`src/middlewares/paginationMiddleware.${ext}`]: prismaPaginateFile() } : {}),
  ...(db === "none"
    ? {
        [`src/middlewares/paginationMiddleware.${ext}`]: `export async function mongoPaginate() {
  throw new Error("Pagination requires --db mongo");
}
export async function prismaPaginate() {
  throw new Error("Pagination requires --db postgres");
}
export function isMongooseModel() { return false; }
`,
      }
    : {}),

  // ✅ Upload middleware
  [`src/middlewares/uploadMiddleware.${ext}`]: uploadMiddlewareTemplate(),

  [`server.${ext}`]: serverFile,

  ".gitignore": `node_modules
.env
dist
uploads/*
!uploads/.gitkeep
.prisma
`,
  "uploads/.gitkeep": "",

  ".env": `NODE_ENV=development
PORT=5000
JWT_SECRET=your_jwt_secret
LOG_LEVEL=debug
COMMIT_SHA=
SLOW_QUERY_MS=200
${db === "mongo" ? `MONGO_URI="mongodb://localhost:27017/${projectName}"\n` : ""}
${db === "postgres" ? `DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/${projectName}?schema=public"\n` : ""}
`,
};

Object.entries(sharedFiles).forEach(([p, c]) => writeFile(p, c));

/* ---------------------------
   Prisma schema base (postgres)
---------------------------- */
if (db === "postgres") {
  writeFile(
    "prisma/schema.prisma",
    `generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// Models will be appended by the generator below.
`
  );
}

/* ---------------------------
   Module templates per DB
---------------------------- */
function moduleTemplates(rawName) {
  const name = toKebab(rawName);
  const camel = toCamel(rawName);
  const pascal = toPascal(rawName);
  const plural = pluralize(name);
  const prismaDelegate = pascal.charAt(0).toLowerCase() + pascal.slice(1);

  const moduleBasePath = `src/modules/${name}`;

  // schema
  let schema = "";
  if (db === "mongo") {
    const userExtra =
      name === "user"
        ? `    name: { type: String },
    email: { type: String, unique: true, index: true },
    role: { type: String, default: "user" },
    isDeleted: { type: Boolean, default: false },
`
        : ``;

    schema = `import mongoose from "mongoose";

const ${pascal}Schema = new mongoose.Schema(
  {
${userExtra}    // add fields
  },
  { timestamps: true }
);

const ${pascal}Model = mongoose.model("${pascal}", ${pascal}Schema);
export default ${pascal}Model;
`;
  } else if (db === "postgres") {
    schema = `// Prisma model is generated into prisma/schema.prisma
export const PrismaModelName = "${pascal}";
`;
  } else {
    schema = `export const ${pascal}Schema = {};
`;
  }

  const messagesFile = `export const ${pascal}Messages = {
  GET_ALL_SUCCESS: "All ${pascal}s",
  GET_SUCCESS: "${pascal} fetched",
  CREATE_SUCCESS: "${pascal} created",
  CREATE_FAILED: "Failed to create ${pascal}",
  UPDATE_SUCCESS: "${pascal} updated",
  UPDATE_FAILED: "Failed to update ${pascal}",
  DELETE_SUCCESS: "${pascal} deleted",
  DELETE_FAILED: "Failed to delete ${pascal}",
  NOT_FOUND: "${pascal} not found",
};
`;

  const validationFile = `import { z } from "zod";

export const create${pascal}Schema = z.object({
  // title: z.string().min(1),
});

export const update${pascal}Schema = z.object({
  // title: z.string().min(1).optional(),
});

export const idParamSchema = z.object({
  id: z.string().min(1),
});

export const GetAllQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  sortBy: z.string().optional(),
  search: z.string().optional(),
  searchMode: z.enum(["contains", "startsWith"]).optional(),
  select: z.string().optional(),
  populate: z.string().optional(),
});

export const ${pascal}Validation = {
  createValidation: { body: create${pascal}Schema },
  updateValidation: { body: update${pascal}Schema },
  idValidation: { params: idParamSchema },
  listValidation: { query: GetAllQuerySchema },
  updateWithIdValidation: { params: idParamSchema, body: update${pascal}Schema },
};
`;

  let repository = "";
  if (db === "mongo") {
    repository = `import ${pascal}Model from "./${name}.schema.${ext}";

export const create${pascal}Record = async (payload) => {
  const doc = await ${pascal}Model.create(payload);
  return doc.toObject();
};

export const find${pascal}ById = async (id) => {
  const doc = await ${pascal}Model.findById(id).lean();
  return doc ?? null;
};

export const update${pascal}ById = async (id, payload) => {
  const doc = await ${pascal}Model.findByIdAndUpdate(id, payload, { new: true }).lean();
  return doc ?? null;
};

export const remove${pascal}ById = async (id) => {
  const doc = await ${pascal}Model.findByIdAndDelete(id).lean();
  return !!doc;
};
`;
  } else if (db === "postgres") {
    repository = `import { prisma } from "../../config/db.${ext}";

export const create${pascal}Record = async (payload) =>
  prisma.${prismaDelegate}.create({ data: payload });

export const find${pascal}ById = async (id) =>
  prisma.${prismaDelegate}.findUnique({ where: { id } });

export const update${pascal}ById = async (id, payload) => {
  const existing = await prisma.${prismaDelegate}.findUnique({ where: { id } });
  if (!existing) return null;
  return prisma.${prismaDelegate}.update({ where: { id }, data: payload });
};

export const remove${pascal}ById = async (id) => {
  const existing = await prisma.${prismaDelegate}.findUnique({ where: { id } });
  if (!existing) return false;
  await prisma.${prismaDelegate}.delete({ where: { id } });
  return true;
};
`;
  } else {
    repository = `export const create${pascal}Record = async (payload) => payload;
export const find${pascal}ById = async (_id) => null;
export const update${pascal}ById = async (_id, _payload) => null;
export const remove${pascal}ById = async (_id) => true;
`;
  }

  // ✅ Service uses paginate and returns return-block
  let service = "";
  if (db === "mongo") {
    service = `import { logger } from "../../utils/logger.${ext}";
import { getCtx } from "../../utils/context.${ext}";
import errorResponse from "../../utils/errorResponse.${ext}";
import { mongoPaginate } from "../../middlewares/paginationMiddleware.${ext}";
import ${pascal}Model from "./${name}.schema.${ext}";
import { ${pascal}Messages } from "./${name}.messages.${ext}";
import {
  create${pascal}Record,
  find${pascal}ById,
  update${pascal}ById,
  remove${pascal}ById
} from "./${name}.repository.${ext}";

export const getAll${pascal}s = async (filter = {}, options = {}) => {
  const rows = await mongoPaginate(${pascal}Model, filter, options);
  return {
    success: true,
    status: 200,
    message: ${pascal}Messages.LIST_SUCCESS,
    data: rows,
  };
};

export const create${pascal} = async (data) => {
  const ${name} = await create${pascal}Record(data);
  if(!${name}) {
    logger.warn({ event: "${name}_service_error", svc: "${name}", action: "create_${name}", reason: "${pascal.toUpperCase()}_NOT_FOUND", ...getCtx() });
    throw new errorResponse(${pascal}Messages.NOT_FOUND, 404);
  }
  return {
    success: true,
    status: 201,
    message: ${pascal}Messages.CREATE_SUCCESS,
    data: record,
  };
};

export const get${pascal} = async (id) => {
  const ${name} = await find${pascal}ById(id);
  if (!${name}) {
    logger.warn({ event: "${name}_service_error", svc: "${name}", action: "get_${name}", reason: "${pascal.toUpperCase()}_NOT_FOUND", ...getCtx() });
    throw new errorResponse(${pascal}Messages.NOT_FOUND, 404);
  }
  return {
    success: true,
    status: 200,
    message: ${pascal}Messages.GET_SUCCESS,
    data: ${name},
  };
};

export const update${pascal} = async (id, data) => {
  const ${name} = await update${pascal}ById(id, data);
  if (!${name}) {
    logger.warn({ event: "${name}_service_error", svc: "${name}", action: "update_${name}", reason: "${pascal.toUpperCase()}_NOT_FOUND", ...getCtx() });
    throw new errorResponse(${pascal}Messages.NOT_FOUND, 404);
  }
  return {
    success: true,
    status: 200,
    message: ${pascal}Messages.UPDATE_SUCCESS,
    data: ${name},
  };
};

export const remove${pascal} = async (id) => {
  const ${name} = await remove${pascal}ById(id);
  if (!${name}) {
    logger.warn({ event: "${name}_service_error", svc: "${name}", action: "remove_${name}", reason: "${pascal.toUpperCase()}_NOT_FOUND", ...getCtx() });
    throw new errorResponse(${pascal}Messages.NOT_FOUND, 404);
  }
  return {
    success: true,
    status: 200,
    message: ${pascal}Messages.DELETE_SUCCESS,
    data: { deleted: true },
  };
};
`;
  } else if (db === "postgres") {
    service = `import { logger } from "../../utils/logger.${ext}";
import { getCtx } from "../../utils/context.${ext}";
import errorResponse from "../../utils/errorResponse.${ext}";
import { prismaPaginate } from "../../middlewares/paginationMiddleware.${ext}";
import { prisma } from "../../config/db.${ext}";
import { ${pascal}Messages } from "./${name}.messages.${ext}";
import {
  create${pascal}Record,
  find${pascal}ById,
  update${pascal}ById,
  remove${pascal}ById
} from "./${name}.repository.${ext}";

export const create${pascal} = async (data) => {
  const record = await create${pascal}Record(data);
  return {
    success: true,
    status: 201,
    message: ${pascal}Messages.CREATE_SUCCESS,
    data: record,
  };
};

export const list${pascal} = async (filter = {}, options = {}) => {
  const rows = await prismaPaginate(prisma.${prismaDelegate}, filter, options);
  return {
    success: true,
    status: 200,
    message: ${pascal}Messages.LIST_SUCCESS,
    data: rows,
  };
};

export const get${pascal} = async (id) => {
  const item = await find${pascal}ById(id);
  if (!item) {
    logger.warn({ event: "${name}_service_error", svc: "${name}", action: "get_${name}", reason: "${pascal.toUpperCase()}_NOT_FOUND", ...getCtx() });
    throw new errorResponse(${pascal}Messages.NOT_FOUND, 404);
  }
  return {
    success: true,
    status: 200,
    message: ${pascal}Messages.GET_SUCCESS,
    data: item,
  };
};

export const update${pascal} = async (id, data) => {
  const updated = await update${pascal}ById(id, data);
  if (!updated) {
    logger.warn({ event: "${name}_service_error", svc: "${name}", action: "update_${name}", reason: "${pascal.toUpperCase()}_NOT_FOUND", ...getCtx() });
    throw new errorResponse(${pascal}Messages.NOT_FOUND, 404);
  }
  return {
    success: true,
    status: 200,
    message: ${pascal}Messages.UPDATE_SUCCESS,
    data: updated,
  };
};

export const remove${pascal} = async (id) => {
  const ok = await remove${pascal}ById(id);
  if (!ok) {
    logger.warn({ event: "${name}_service_error", svc: "${name}", action: "remove_${name}", reason: "${pascal.toUpperCase()}_NOT_FOUND", ...getCtx() });
    throw new errorResponse(${pascal}Messages.NOT_FOUND, 404);
  }
  return {
    success: true,
    status: 200,
    message: ${pascal}Messages.DELETE_SUCCESS,
    data: { deleted: true },
  };
};
`;
  } else {
    service = `import { ${pascal}Messages } from "./${name}.messages.${ext}";

export const create${pascal} = async (data) => ({
  success: true,
  status: 201,
  message: ${pascal}Messages.CREATE_SUCCESS,
  data,
});

export const list${pascal} = async (_filter = {}, _options = {}) => ({
  success: true,
  status: 200,
  message: ${pascal}Messages.LIST_SUCCESS,
  data: [],
});

export const get${pascal} = async (_id) => ({
  success: true,
  status: 200,
  message: ${pascal}Messages.GET_SUCCESS,
  data: null,
});

export const update${pascal} = async (_id, data) => ({
  success: true,
  status: 200,
  message: ${pascal}Messages.UPDATE_SUCCESS,
  data,
});

export const remove${pascal} = async (_id) => ({
  success: true,
  status: 200,
  message: ${pascal}Messages.DELETE_SUCCESS,
  data: { deleted: true },
});
`;
  }

  // ✅ Controller now uses options = {} (empty), buildListOptions removed completely
  const controller = `import { asyncHandler } from "../../utils/asyncHandler.${ext}";
import { sendSuccess } from "../../utils/globalResponse.${ext}";
import {
  create${pascal},
  getAll${pascal}s,
  get${pascal},
  update${pascal},
  remove${pascal}
} from "./${name}.service.${ext}";

export const create${pascal}Controller= asyncHandler(
  async (req, res) => {
    const record = await create${pascal}(req.body);
    return sendSuccess(res, record.status, record.message, record.data);
  },
  { ctrl: "${name}", action: "create_${name}" }
);

export const list${pascal}Controller= asyncHandler(
  async (req, res) => {
    const filter = {};
    const options = {};

    const record = await getAll${pascal}s(filter, options);
    return sendSuccess(res, record.status, record.message, record.data);
  },
  { ctrl: "${name}", action: "list_${name}" }
);

export const get${pascal}Controller= asyncHandler(
  async (req, res) => {
    const record = await get${pascal}(req.params.id);
    return sendSuccess(res, record.status, record.message, record.data);
  },
  { ctrl: "${name}", action: "get_${name}" }
);

export const update${pascal}Controller= asyncHandler(
  async (req, res) => {
    const record = await update${pascal}(req.params.id, req.body);
    return sendSuccess(res, record.status, record.message, record.data);
  },
  { ctrl: "${name}", action: "update_${name}" }
);

export const remove${pascal}Controller= asyncHandler(
  async (req, res) => {
    const record = await remove${pascal}(req.params.id);
    return sendSuccess(res, record.status, record.message, record.data);
  },
  { ctrl: "${name}", action: "remove_${name}" }
);
`;

  // ✅ Routes: NO pagination middleware
  const routes = `import { Router } from "express";
import { validate } from "../../middlewares/validate.${ext}";
import { ${pascal}Validation } from "./${name}.validation.${ext}";
import {
  create${pascal}Controller,
  list${pascal}Controller,
  get${pascal}Controller,
  update${pascal}Controller,
  remove${pascal}Controller
} from "./${name}.controller.${ext}";

const router = Router();

router.post("/", validate(${pascal}Validation.createValidation), create${pascal}Controller);
router.get("/", validate(${pascal}Validation.listValidation), list${pascal}Controller);

router.get("/:id", validate(${pascal}Validation.idValidation), get${pascal}Controller);
router.patch("/:id", validate(${pascal}Validation.updateWithIdValidation), update${pascal}Controller);
router.delete("/:id", validate(${pascal}Validation.idValidation), remove${pascal}Controller);

export default router;
`;

  return {
    module: { name, camel, pascal, plural, prismaDelegate },
    files: {
      [`${moduleBasePath}/${name}.schema.${ext}`]: schema,
      [`${moduleBasePath}/${name}.messages.${ext}`]: messagesFile,
      [`${moduleBasePath}/${name}.validation.${ext}`]: validationFile,
      [`${moduleBasePath}/${name}.repository.${ext}`]: repository,
      [`${moduleBasePath}/${name}.service.${ext}`]: service,
      [`${moduleBasePath}/${name}.controller.${ext}`]: controller,
      [`${moduleBasePath}/${name}.routes.${ext}`]: routes,
    },
  };
}

/* ---------------------------
   Create modules + mount routes + Prisma models
---------------------------- */
const routesFilePath = path.join(base, `src/routes.${ext}`);
let routesContent = fs.readFileSync(routesFilePath, "utf8");

modules.forEach((m) => {
  const tpl = moduleTemplates(m);

  Object.entries(tpl.files).forEach(([p, c]) => writeFile(p, c));

  const importLine = `import ${tpl.module.camel}Routes from "./modules/${tpl.module.name}/${tpl.module.name}.routes.${ext}";\n`;
  if (!routesContent.includes(importLine)) {
    routesContent = routesContent.replace(
      `import { Router } from "express";\n`,
      `import { Router } from "express";\n${importLine}`
    );
  }

  const mountLine = `router.use("/${tpl.module.plural}", ${tpl.module.camel}Routes);\n`;
  if (!routesContent.includes(mountLine)) {
    routesContent = routesContent.replace(
      `// modules will be mounted here by the generator\n`,
      `// modules will be mounted here by the generator\n${mountLine}`
    );
  }

  if (db === "postgres") {
    if (tpl.module.name === "user") {
      appendFile(
        "prisma/schema.prisma",
        `

model User {
  id        String   @id @default(uuid())
  name      String?
  email     String?  @unique
  role      String   @default("user")
  isDeleted Boolean  @default(false)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
`
      );
    } else {
      appendFile(
        "prisma/schema.prisma",
        `

model ${tpl.module.pascal} {
  id        String   @id @default(uuid())
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
`
      );
    }
  }
});

fs.writeFileSync(routesFilePath, routesContent, "utf8");

/* ---------------------------
   package.json (ALWAYS LATEST)
---------------------------- */
const pkgJsonPath = path.join(base, "package.json");
if (!fs.existsSync(pkgJsonPath)) {
  const deps = {
    express: "latest",
    zod: "latest",
    dotenv: "latest",
    pino: "latest",
    "pino-pretty": "latest",
    jsonwebtoken: "latest",

    multer: "latest",
    "mime-types": "latest",
  };

  if (db === "mongo") deps.mongoose = "latest";
  if (db === "postgres") deps["@prisma/client"] = "latest";

  const scripts = {
    dev: "nodemon --legacy-watch --watch src --watch server.mjs --ext mjs,json server.mjs",
    start: "node server.mjs",
  };

  const devDependencies = {
    nodemon: "latest",
  };

  if (db === "postgres") {
    scripts["prisma:generate"] = "prisma generate";
    scripts["prisma:migrate"] = "prisma migrate dev";
    scripts.postinstall = "prisma generate";
    devDependencies.prisma = "latest";
  }

  writeFile(
    "package.json",
    JSON.stringify(
      {
        name: projectName,
        version: "1.0.0",
        type: "module",
        scripts,
        dependencies: deps,
        devDependencies,
      },
      null,
      2
    ) + "\n"
  );
}

console.log(`Backend (.mjs) structure created successfully 🚀`);
console.log(`DB mode: ${db}`);
if (modules.length) console.log(`Modules scaffolded: ${modules.join(", ")}`);

if (db === "postgres") {
  console.log("Postgres mode notes:");
  console.log("- Update DATABASE_URL in .env");
  console.log("- Run: npm i");
  console.log("- Run: npm run prisma:migrate");
}
if (db === "mongo") {
  console.log("Mongo mode notes:");
  console.log("- Update MONGO_URI in .env");
  console.log("- Run: npm i");
}