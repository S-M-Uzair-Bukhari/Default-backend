/**
 * create-backend.mjs (JS/.mjs PRODUCTION VERSION)
 *
 * Generates a production-ready ESM backend scaffold (.mjs only)
 * - DB: --db none | mongo | postgres
 * - Modules: --modules user,post
 *
 * Requirements implemented:
 * - Mongo pagination file kept EXACTLY as you provided (mongoPaginate/isMongooseModel)
 * - NO pagination middleware usage in routes
 * - Controllers build: filter = {} and options = {} then call service
 * - Services call paginate (mongoPaginate for Mongo / sequelizePaginate for Postgres)
 * - sendSuccess signature everywhere: sendSuccess(res, status, message, data)
 * - Services return block: { success, status, message, data }
 * - Each module includes Messages file: module.messages.mjs
 * - Sequelize slow query logger included
 * - Mongoose slow query plugin included
 * - uploadMiddleware.mjs included (JS version)
 *
 * Examples:
 *  node .\generators\javaScript-backend-updated.mjs my-api --db mongo --modules user,post
 *  node .\generators\javaScript-backend-updated.mjs my-api --db postgres --modules user,post
 * 
 * TEST: 
 * npm run create -- my-api --db postgres --modules user,post
 */

import fs from "fs";
import path from "path";

/* ---------------------------
   CLI args
---------------------------- */
const projectName = process.argv[2];
const modulesArg = getArgValue("--modules");
let modules = modulesArg
  ? [...new Set(
    modulesArg
      .split(",")
      .map((m) => normalizeModuleName(m))
      .filter(Boolean)
  )]
  : [];

const db = (getArgValue("--db") || "none").toLowerCase(); // mongo | postgres | none
if (!["mongo", "postgres", "none"].includes(db)) {
  console.log("Invalid --db value. Use: mongo | postgres | none");
  process.exit(1);
}

if (!projectName) {
  console.log("Please provide project name");
  console.log("Example: npm run create -- my-api --modules user,post --db mongo");
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

function normalizeModuleName(str) {
  const normalized = toKebab(str).replace(/^-+|-+$/g, "");

  if (normalized === "users") {
    return "user";
  }

  return normalized;
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
  "src/docs",
  "uploads",
];
folders.forEach((folder) => ensureDir(path.join(base, folder)));

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

const sequelizeSlowQueriesFile = `import { logger } from "../utils/logger.${ext}";

export const createSequelizeLogger = (thresholdMs = 200) => {
  return (sql, timingMs) => {
    if (typeof timingMs !== "number" || timingMs <= thresholdMs) return;

    logger.warn({
      event: "db_slow_query",
      orm: "sequelize",
      ms: timingMs,
      sql,
    });
  };
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
      ? `import { Sequelize } from "sequelize";
import env from "./env.${ext}";
import { logger } from "../utils/logger.${ext}";
import { createSequelizeLogger } from "./slowQueriesSequelize.${ext}";

export const sequelize = new Sequelize(env.DATABASE_URL, {
  dialect: "postgres",
  logging: createSequelizeLogger(Number(env.SLOW_QUERY_MS || 200)),
  benchmark: true,
});

export const connectDB = async () => {
  if (!env.DATABASE_URL) throw new Error("DATABASE_URL is missing");

  await sequelize.authenticate();
  await sequelize.sync();
  logger.info({ event: "db_connected", db: "postgres" });
};

const handleExit = async (signal) => {
  logger.info({ event: "sequelize_connection_close", signal });

  try {
    await sequelize.close();
    logger.info({ event: "sequelize_connection_closed" });
    process.exit(0);
  } catch (err) {
    logger.error({
      event: "sequelize_connection_close_error",
      error: err?.message,
      stack: err?.stack,
    });
    process.exit(1);
  }
};

process.on("SIGINT", () => {
  void handleExit("SIGINT");
});
process.on("SIGTERM", () => {
  void handleExit("SIGTERM");
});
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

    const user = await UserModel.findOne({
      where: { id: decoded.sub, isDeleted: false },
    });

    if (!user) {
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

  const errorName = err?.name || "";
  const dbCode = err?.original?.code || err?.parent?.code || err?.code;
  const isSequelize = typeof errorName === "string" && errorName.includes("Sequelize");

  if (isSequelize) {
    if (errorName === "SequelizeUniqueConstraintError" || dbCode === "23505") {
      const fields = Array.isArray(err?.errors)
        ? err.errors.map((item) => item?.path).filter(Boolean)
        : [];

      status = 409;
      message =
        "A record with the same information already exists. Please try again with different values.";
      data = { type: "SequelizeUniqueConstraintError", code: dbCode || err?.name, fields };
    } else if (errorName === "SequelizeValidationError") {
      const messages = Array.isArray(err?.errors)
        ? err.errors.map((item) => item?.message).filter(Boolean)
        : [];
      const fields = Array.isArray(err?.errors)
        ? err.errors.map((item) => item?.path).filter(Boolean)
        : [];

      status = 400;
      message = messages.join(", ") || "Validation failed. Please verify input and try again.";
      data = { type: "SequelizeValidationError", code: dbCode || err?.name, fields };
    } else if (errorName === "SequelizeForeignKeyConstraintError" || dbCode === "23503") {
      status = 409;
      message = "The requested relation is invalid.";
      data = { type: "SequelizeForeignKeyConstraintError", code: dbCode || err?.name, table: err?.table };
    } else if (errorName === "SequelizeEmptyResultError") {
      status = 404;
      message = "Record not found";
      data = { type: "SequelizeEmptyResultError", code: dbCode || err?.name };
    } else if (
      errorName === "SequelizeConnectionError" ||
      errorName === "SequelizeConnectionAcquireTimeoutError" ||
      errorName === "SequelizeConnectionRefusedError"
    ) {
      status = 503;
      message = "Database connection failed. Please try again.";
      data = { type: errorName || "SequelizeConnectionError", code: dbCode || err?.name };
    } else {
      status = status || 400;
      message = message || "Database error";
      data = { type: errorName || "SequelizeError", code: dbCode || err?.name };
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
    // Correct fallback - Mongoose expects "-createdAt" not "createdAt:desc"
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
        // dot-path string to nested populate objects
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
   Sequelize paginate helper (service usage)
---------------------------- */
function sequelizePaginateFile() {
  return `import { Op } from "sequelize";

const parseSort = (sortBy) => {
  if (!sortBy) return [["createdAt", "DESC"]];

  const pieces = String(sortBy)
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);

  const order = [];
  for (const p of pieces) {
    const [field, direction] = p.split(":");
    if (!field) continue;

    order.push([field, (direction || "desc").toLowerCase() === "asc" ? "ASC" : "DESC"]);
  }

  return order.length ? order : [["createdAt", "DESC"]];
};

const parseSelect = (select) => {
  if (!select) return undefined;
  if (Array.isArray(select)) return select;

  return String(select)
    .split(",")
    .map((field) => field.trim())
    .filter(Boolean);
};

export const sequelizePaginate = async (model, filter = {}, options = {}, skipPagination = false) => {
  const where = { ...(filter || {}) };
  const opts = { ...(options || {}) };

  if (opts?.search && Array.isArray(opts.searchFields) && opts.searchFields.length) {
    const raw = String(opts.search).trim();
    if (raw) {
      const pattern = opts.searchMode === "startsWith" ? \`\${raw}%\` : \`%\${raw}%\`;
      const searchGroup = {
        [Op.or]: opts.searchFields.map((field) => ({
          [field]: { [Op.iLike]: pattern },
        })),
      };

      if (where[Op.and]) {
        where[Op.and] = Array.isArray(where[Op.and])
          ? [...where[Op.and], searchGroup]
          : [where[Op.and], searchGroup];
      } else {
        where[Op.and] = [searchGroup];
      }
    }
  }

  const limit = opts?.limit && parseInt(opts.limit, 10) > 0 ? parseInt(opts.limit, 10) : 10;
  const page = opts?.page && parseInt(opts.page, 10) > 0 ? parseInt(opts.page, 10) : 1;
  const offset = (page - 1) * limit;

  const order = opts?.order || parseSort(opts?.sortBy);
  const attributes = parseSelect(opts?.select);
  const include = opts?.include || opts?.populate || undefined;

  const result = await model.findAndCountAll({
    where,
    order,
    attributes,
    include,
    distinct: true,
    ...(skipPagination ? {} : { limit, offset }),
  });

  const totalResults = typeof result.count === "number" ? result.count : result.count.length;
  const totalPages = skipPagination ? 0 : Math.ceil(totalResults / limit);

  return {
    data: result.rows,
    page,
    limit,
    totalPages,
    totalResults,
  };
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

function securityMiddlewareTemplate() {
  return `import express from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import mongoSanitize from "express-mongo-sanitize";
import hpp from "hpp";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { getCtx } from "../utils/context.${ext}";
import { logger } from "../utils/logger.${ext}";
import env from "../config/env.${ext}";
// import swaggerDocs from "../config/swaggerConfig.${ext}";

const corsOptions = {
  origin: (origin, callback) => {
    const allowedOrigins = ["http://localhost:3000"];

    // Allow same-origin/no-origin (mobile apps, curl) and dev
    if (!origin || env.NODE_ENV === "development") {
      return callback(null, true);
    }

    const allowed = allowedOrigins.some((allowed) => {
      if (allowed instanceof RegExp) return allowed.test(origin);
      return origin === allowed;
    });

    if (allowed) {
      return callback(null, true);
    } else {
      // Log blocked origin for diagnostics
      logger.warn({ event: "cors_blocked", origin, ...getCtx() });
      return callback(new Error("Blocked by CORS"));
    }
  },
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "Cache-Control", "ngrok-skip-browser-warning"],
  credentials: true,
  optionsSuccessStatus: 200,
};

const customSanitizerMiddleware = (req, res, next) => {
  void res;
  const sanitize = mongoSanitize.sanitize;
  if (req.body) sanitize(req.body);
  if (req.query) sanitize(req.query);
  if (req.params) sanitize(req.params);
  next();
};

const securityMiddleware = (app) => {
  // 1. CORS FIRST - Handle preflight requests early
  app.use(cors(corsOptions));

  // Cookie parser so req.cookies is populated
  app.use(cookieParser());

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: "cross-origin" },
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "https://cdnjs.cloudflare.com", "'strict-dynamic'"],
          styleSrc: ["'self'", "https://fonts.googleapis.com"],
          fontSrc: ["'self'", "https://fonts.gstatic.com"],
          imgSrc: ["'self'", "data:", process.env.IMAGE_BASE_URL],
          connectSrc: [
            "'self'",
            "http://localhost:5000",
            "http://192.168.18.235:5000",
            "https://192.168.18.235:5000",
            "https://hippo-sure-firstly.ngrok-free.app/",
            "https://selectable-deandra-earless.ngrok-free.dev",
            "https://*.ngrok-free.app",
          ],
          upgradeInsecureRequests: [],
        },
      },
      crossOriginOpenerPolicy: { policy: "same-origin" },
      referrerPolicy: { policy: "strict-origin" },
    })
  );

  // 3. Body Parsers
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.use((req, res, next) => {
    void res;
    const descriptor = Object.getOwnPropertyDescriptor(req, "query");
    Object.defineProperty(req, "query", {
      ...descriptor,
      value: req.query,
      writable: true,
    });
    next();
  });

  // 4. Data Sanitization (After body parsers)
  app.use(customSanitizerMiddleware);

  // 5. HTTP Parameter Pollution
  app.use(hpp({ whitelist: ["category", "price"] }));

  // 6. Trust proxy when using ngrok or production
  app.set("trust proxy", 1);

  // 7. Rate Limiting (Last security layer)
  app.use(rateLimit({ windowMs: 10 * 60 * 1000, max: 10000 }));

  // 8. Swagger UI
  // if (process.env.NODE_ENV !== "production") {
  //   swaggerDocs(app);
  // }
};

export default securityMiddleware;
`;
}
function autoRouterTemplate() {
  return `import { Router } from "express";
import { zodToJsonSchema } from "zod-to-json-schema";
import { swaggerPaths, swaggerErrorResponses } from "./swagger.registry.${ext}";

const normalizePath = (path) => {
  if (!path.startsWith("/")) return "/" + path;
  return path;
};

const joinPaths = (basePath, routePath) => {
  const base = normalizePath(basePath).replace(/\\/+$/, "");
  const route = normalizePath(routePath);

  if (route === "/") return base || "/";
  return \`\${base}\${route}\`;
};

const toOpenApiPath = (path) => {
  return path.replace(/:([^/]+)/g, "{$1}");
};

const toPathParameters = (path) => {
  const matches = [...path.matchAll(/:([^/]+)/g)];
  return matches.map((m) => ({
    name: m[1],
    in: "path",
    required: true,
    schema: { type: "string" },
  }));
};

const toSchema = (schema) => {
  if (!schema) return undefined;

  const result = zodToJsonSchema(schema, { target: "openApi3" });

  if (result?.$schema) {
    delete result.$schema;
  }

  return result;
};

const toQueryParameters = (schema) => {
  const jsonSchema = toSchema(schema);

  if (!jsonSchema || jsonSchema.type !== "object" || !jsonSchema.properties) {
    return [];
  }

  const required = Array.isArray(jsonSchema.required) ? jsonSchema.required : [];

  return Object.entries(jsonSchema.properties).map(([name, propSchema]) => ({
    name,
    in: "query",
    required: required.includes(name),
    schema: propSchema,
  }));
};

export const createAutoRouter = (basePath = "", defaultTag) => {
  const router = Router();
  const methods = ["get", "post", "patch", "delete"];

  methods.forEach((method) => {
    const original = router[method];

    router[method] = function (path, ...handlers) {
      if (typeof path !== "string") {
        return original.call(router, path, ...handlers);
      }

      const meta = {
        tags: defaultTag ? [defaultTag] : [],
      };

      handlers.forEach((h) => {
        if (h?.constructor?.__swaggerFactory) {
          const data = h.constructor.__swaggerFactory(h.schema);
          meta.params = data.params ?? meta.params;
          meta.body = data.body ?? meta.body;
          meta.query = data.query ?? meta.query;
          meta.tags = data.tags?.length ? data.tags : meta.tags;
          meta.summary = data.summary ?? meta.summary;
          meta.description = data.description ?? meta.description;
          meta.response = data.response ?? meta.response;
          meta.responseExample = data.responseExample ?? meta.responseExample;
          meta.auth = data.auth ?? meta.auth;
          meta.errors = data.errors ?? meta.errors;
        } else if (h?.__swagger) {
          meta.params = h.__swagger.params ?? meta.params;
          meta.body = h.__swagger.body ?? meta.body;
          meta.query = h.__swagger.query ?? meta.query;
          meta.tags = h.__swagger.tags?.length ? h.__swagger.tags : meta.tags;
          meta.summary = h.__swagger.summary ?? meta.summary;
          meta.description = h.__swagger.description ?? meta.description;
          meta.response = h.__swagger.response ?? meta.response;
          meta.responseExample = h.__swagger.responseExample ?? meta.responseExample;
          meta.auth = h.__swagger.auth ?? meta.auth;
          meta.errors = h.__swagger.errors ?? meta.errors;
        }
      });

      const fullExpressPath = joinPaths(basePath, path);
      const openApiPath = toOpenApiPath(fullExpressPath);

      if (!swaggerPaths[openApiPath]) {
        swaggerPaths[openApiPath] = {};
      }

      const pathParameters = toPathParameters(fullExpressPath);
      const queryParameters = toQueryParameters(meta.query);
      const parameters = [...pathParameters, ...queryParameters];

      const responses = {
        200: {
          description: "Success",
          content: {
            "application/json": {
              schema: toSchema(meta.response) || { type: "object" },
              example: meta.responseExample,
            },
          },
        },
      };

      const autoErrorStatuses = new Set();

      if (meta.body || meta.query || meta.params) {
        autoErrorStatuses.add(400);
      }

      if (meta.auth) {
        autoErrorStatuses.add(401);
      }

      autoErrorStatuses.add(500);

      (meta.errors || []).forEach((status) => autoErrorStatuses.add(status));

      [...autoErrorStatuses].forEach((status) => {
        const errorDef = swaggerErrorResponses[status];
        if (!errorDef) return;

        responses[status] = {
          description: errorDef.description,
          content: {
            "application/json": {
              schema: toSchema(errorDef.schema),
              example: errorDef.example,
            },
          },
        };
      });

      swaggerPaths[openApiPath][method] = {
        tags: meta.tags?.length ? meta.tags : ["default"],
        summary: meta.summary || \`\${method.toUpperCase()} \${openApiPath}\`,
        description: meta.description,
        parameters: parameters.length ? parameters : undefined,
        requestBody:
          meta.body && !["get"].includes(method)
            ? {
                required: true,
                content: {
                  "application/json": {
                    schema: toSchema(meta.body),
                  },
                },
              }
            : undefined,
        responses,
        security: meta.auth ? [{ bearerAuth: [] }] : undefined,
      };

      return original.call(router, path, ...handlers);
    };
  });

  return router;
};
`;
}
function swaggerRegistryTemplate() {
  return `import { z } from "zod";

export const swaggerPaths = {};

export const withSwagger = (handler, meta) => {
  handler.__swagger = meta;
  return handler;
};

const baseErrorDataSchema = z.object({}).passthrough();

export const apiErrorResponseSchema = z.object({
  success: z.literal(false),
  status: z.number(),
  message: z.string(),
  data: baseErrorDataSchema,
});

export const validationErrorDataSchema = z.array(
  z.object({
    path: z.string(),
    message: z.string(),
  })
);

export const validationErrorResponseSchema = z.object({
  success: z.literal(false),
  status: z.literal(400),
  message: z.string(),
  data: validationErrorDataSchema,
});

export const authErrorResponseSchema = z.object({
  success: z.literal(false),
  status: z.literal(401),
  message: z.string(),
  data: z.object({
    type: z.string(),
  }),
});

export const fsErrorResponseSchema = z.object({
  success: z.literal(false),
  status: z.union([z.literal(400), z.literal(403)]),
  message: z.string(),
  data: z.object({
    type: z.literal("FsError"),
    code: z.string(),
    reason: z.string(),
  }).passthrough(),
});

export const multerErrorResponseSchema = z.object({
  success: z.literal(false),
  status: z.union([z.literal(400), z.literal(413)]),
  message: z.string(),
  data: z.object({
    type: z.literal("MulterError"),
    code: z.string().optional(),
  }),
});

export const databaseErrorResponseSchema = z.object({
  success: z.literal(false),
  status: z.number(),
  message: z.string(),
  data: z.object({
    type: z.literal("DatabaseError"),
    provider: z.string(),
    name: z.string().optional(),
    code: z.string().optional(),
    reason: z.string().optional(),
    meta: z.any().nullable().optional(),
    clientVersion: z.any().nullable().optional(),
    detail: z.any().nullable().optional(),
    schema: z.any().nullable().optional(),
    table: z.any().nullable().optional(),
    column: z.any().nullable().optional(),
    constraint: z.any().nullable().optional(),
    routine: z.any().nullable().optional(),
    errorCode: z.any().nullable().optional(),
  }).passthrough(),
});

export const swaggerErrorResponses = {
  400: {
    description: "Bad Request",
    schema: validationErrorResponseSchema,
    example: {
      success: false,
      status: 400,
      message: "validation Error",
      data: [
        {
          path: "email",
          message: "Invalid email",
        },
      ],
    },
  },
  401: {
    description: "Unauthorized",
    schema: authErrorResponseSchema,
    example: {
      success: false,
      status: 401,
      message: "Invalid token",
      data: {
        type: "JsonWebTokenError",
      },
    },
  },
  403: {
    description: "Forbidden",
    schema: apiErrorResponseSchema,
    example: {
      success: false,
      status: 403,
      message: "The server does not have permission to write to the upload directory.",
      data: {
        type: "FsError",
        code: "EACCES",
        reason: "INSUFFICIENT_PERMISSIONS",
      },
    },
  },
  404: {
    description: "Not Found",
    schema: apiErrorResponseSchema,
    example: {
      success: false,
      status: 404,
      message: "The requested record was not found.",
      data: {
        type: "DatabaseError",
        provider: "sequelize",
        code: "RESOURCE_NOT_FOUND",
        reason: "RECORD_NOT_FOUND",
      },
    },
  },
  409: {
    description: "Conflict",
    schema: databaseErrorResponseSchema,
    example: {
      success: false,
      status: 409,
      message: "Duplicate value violates unique constraint.",
      data: {
        type: "DatabaseError",
        provider: "sequelize",
        code: "23505",
        reason: "SEQUELIZE_UNIQUE_CONSTRAINT_ERROR",
        meta: {
          target: ["email"],
        },
      },
    },
  },
  413: {
    description: "Payload Too Large",
    schema: multerErrorResponseSchema,
    example: {
      success: false,
      status: 413,
      message: "File too large",
      data: {
        type: "MulterError",
        code: "LIMIT_FILE_SIZE",
      },
    },
  },
  500: {
    description: "Internal Server Error",
    schema: apiErrorResponseSchema,
    example: {
      success: false,
      status: 500,
      message: "Internal Server Error",
      data: {},
    },
  },
  503: {
    description: "Service Unavailable",
    schema: databaseErrorResponseSchema,
    example: {
      success: false,
      status: 503,
      message: "Database connection pool timed out.",
      data: {
        type: "DatabaseError",
        provider: "sequelize",
        code: "SequelizeConnectionAcquireTimeoutError",
        reason: "SEQUELIZE_CONNECTION_ERROR",
      },
    },
  },
};
`;
}
/* ---------------------------
   Shared files
---------------------------- */
const sharedFiles = {
  [`src/app.${ext}`]: `import express from "express";
import fs from "fs";
import path from "path";
import swaggerUi from "swagger-ui-express";

import routes from "./routes.${ext}";
import { requestContext } from "./utils/context.${ext}";
import requestLogger from "./middlewares/requestLogger.${ext}";
import securityMiddleware from "./middlewares/securityMiddleware.${ext}";
import { errorMiddleware } from "./middlewares/errorMiddleware.${ext}";
import { swaggerPaths } from "./docs/swagger.registry.${ext}";

const app = express();

app.use(requestContext);
app.use(requestLogger);
securityMiddleware(app);

app.get("/health", (req, res) => {
  void req;
  return res.json({ ok: true });
});

app.use("/api", routes);

const swaggerDocument = {
  openapi: "3.0.0",
  info: {
    title: "My API",
    version: "1.0.0",
  },
  servers: [
    {
      url: "http://localhost:5000/api",
    },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
      },
    },
  },
  paths: swaggerPaths,
};

const swaggerEnabled = process.env.SWAGGER_ENABLED === "true";
const swaggerWriteFile = process.env.SWAGGER_WRITE_FILE === "true";

if (swaggerWriteFile) {
  const swaggerFilePath = path.join(process.cwd(), "swagger.json");

  fs.writeFileSync(
    swaggerFilePath,
    JSON.stringify(swaggerDocument, null, 2),
    "utf-8"
  );

  console.log(\`Swagger JSON generated at: \${swaggerFilePath}\`);
}

if (swaggerEnabled) {
  app.get("/docs/json", (req, res) => {
    void req;

    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", "attachment; filename=openapi.json");

    return res.send(JSON.stringify(swaggerDocument, null, 2));
  });

  app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));
}

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
  PORT: process.env.PORT || 5000,
  NODE_ENV: process.env.NODE_ENV || "development",

  MONGO_URI: process.env.MONGO_URI,
  DATABASE_URL: process.env.DATABASE_URL,

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
        [`src/config/slowQueriesSequelize.${ext}`]: sequelizeSlowQueriesFile,
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

  // sendSuccess signature updated (your requirement)
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

  // Validate middleware (kept)
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

  [`src/middlewares/securityMiddleware.${ext}`]: securityMiddlewareTemplate(),
  [`src/docs/auto.router.${ext}`]: autoRouterTemplate(),
  [`src/docs/swagger.registry.${ext}`]: swaggerRegistryTemplate(),

  [`src/middlewares/auth.${ext}`]: authMiddlewareTemplate(),
  [`src/middlewares/errorMiddleware.${ext}`]: errorMiddlewareTemplate(),

  // Pagination files
  ...(db === "mongo" ? { [`src/middlewares/paginationMiddleware.${ext}`]: mongoPaginationFileExact() } : {}),
  ...(db === "postgres" ? { [`src/middlewares/paginationMiddleware.${ext}`]: sequelizePaginateFile() } : {}),
  ...(db === "none"
    ? {
        [`src/middlewares/paginationMiddleware.${ext}`]: `export async function mongoPaginate() {
  throw new Error("Pagination requires --db mongo");
}
export async function sequelizePaginate() {
  throw new Error("Pagination requires --db postgres");
}
export function isMongooseModel() { return false; }
`,
      }
    : {}),

  // Upload middleware
  [`src/middlewares/uploadMiddleware.${ext}`]: uploadMiddlewareTemplate(),

  [`server.${ext}`]: serverFile,

  ".gitignore": `node_modules
.env
dist
uploads/*
!uploads/.gitkeep
`,
  "uploads/.gitkeep": "",

  ".env": `NODE_ENV=development
PORT=5000
JWT_SECRET=your_jwt_secret
LOG_LEVEL=debug
COMMIT_SHA=
SLOW_QUERY_MS=200
SWAGGER_ENABLED=true
SWAGGER_WRITE_FILE=true
${db === "mongo" ? `MONGO_URI="mongodb://localhost:27017/${projectName}"\n` : ""}
${db === "postgres" ? `DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/${projectName}"\n` : ""}
`,
};

Object.entries(sharedFiles).forEach(([p, c]) => writeFile(p, c));

/* ---------------------------
   Module templates per DB
---------------------------- */
function moduleTemplates(rawName) {
  const name = normalizeModuleName(rawName);
  const camel = toCamel(name);
  const pascal = toPascal(name);
  const plural = pluralize(name);

  const moduleBasePath = `src/modules/${name}`;

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
    const userExtra =
      name === "user"
        ? `    name: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    email: {
      type: DataTypes.STRING,
      allowNull: true,
      unique: true,
    },
    role: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "user",
    },
    isDeleted: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
`
        : ``;

    schema = `import { DataTypes } from "sequelize";
import { sequelize } from "../../config/db.${ext}";

const ${pascal}Model = sequelize.define(
  "${pascal}",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
${userExtra}    // add fields
  },
  {
    tableName: "${plural}",
    timestamps: true,
  }
);

export default ${pascal}Model;
`;
  } else {
    schema = `export const ${pascal}Schema = {};
`;
  }

  const messagesFile = `export const ${pascal}Messages = {
  LIST_SUCCESS: "${pascal} list fetched",
  GET_SUCCESS: "${pascal} fetched",
  CREATE_SUCCESS: "${pascal} created",
  CREATE_FAILED: "Failed to create ${name}",
  ALREADY_EXIST: "${pascal} Already Exist",
  UPDATE_SUCCESS: "${pascal} updated",
  DELETE_SUCCESS: "${pascal} deleted",
  NOT_FOUND: "${pascal} not found",
};
`;

  const validationFile = `import { z } from "zod";

export const getAll${pascal}sSchema = z.object({
  page: z.coerce.number().optional(),
  limit: z.coerce.number().optional(),
});

export const get${pascal}ByIdSchema = z.object({
  id: z.string().min(1),
});

export const create${pascal}Schema = z.object({
  ${name === "user" ? `name: z.string().min(3),
  email: z.string().email().min(1),` : `// add fields here`}
});

export const update${pascal}Schema = z.object({
  ${name === "user" ? `name: z.string().optional(),
  email: z.string().email().optional(),` : `// add optional fields here`}
});

const ${camel}Schema = z.object({
  id: z.string(),
  ${name === "user"
      ? `name: z.string(),
  email: z.string().email(),
  role: z.string(),
  isDeleted: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),`
      : `// add response fields here`}
});

const paginated${pascal}sDataSchema = z.object({
  data: z.array(${camel}Schema),
  page: z.number(),
  limit: z.number(),
  totalPages: z.number(),
  totalResults: z.number(),
});

export const ${pascal}Validation = {
  getAll${pascal}sValidation: { query: getAll${pascal}sSchema },
  get${pascal}ByIdValidation: { params: get${pascal}ByIdSchema },
  createValidation: { body: create${pascal}Schema },
  update${pascal}ByIdValidation: { query: get${pascal}ByIdSchema, body: update${pascal}Schema },
  deleteValidation: { body: get${pascal}ByIdSchema },

  ${camel}ResponseSchema: z.object({
    success: z.literal(true),
    status: z.literal(200),
    message: z.string(),
    data: ${camel}Schema,
  }),

  ${camel}ListResponseSchema: z.object({
    success: z.literal(true),
    status: z.literal(200),
    message: z.string(),
    data: paginated${pascal}sDataSchema,
  }),

  delete${pascal}ResponseSchema: z.object({
    success: z.literal(true),
    status: z.literal(200),
    message: z.string(),
    data: z.any().optional(),
  }),
};
`;

  const exampleId =
    db === "postgres"
      ? "a0ce7956-d451-487c-a03f-c3b62c8646c9"
      : db === "mongo"
        ? "67db0a1f4c9b7f3a2c1d9e10"
        : "example-id";

  const exampleEntity =
    name === "user"
      ? `{
  id: "${exampleId}",
  name: "John Doe",
  email: "john@example.com",
  role: "user",
  isDeleted: false,
  createdAt: "2026-03-19T18:52:02.833Z",
  updatedAt: "2026-03-19T18:52:02.833Z",
}`
      : `{
  id: "${exampleId}",
  createdAt: "2026-03-19T18:52:02.833Z",
  updatedAt: "2026-03-19T18:52:02.833Z",
}`;

  const docsFile = `import { ${pascal}Validation } from "./${name}.validation.${ext}";
import { ${pascal}Messages } from "./${name}.messages.${ext}";

const ${camel}Example = ${exampleEntity};

export const ${pascal}Docs = {
  list: {
    schema: ${pascal}Validation.${camel}ListResponseSchema,
    example: {
      success: true,
      status: 200,
      message: ${pascal}Messages.LIST_SUCCESS,
      data: {
        data: [${camel}Example],
        page: 1,
        limit: 10,
        totalPages: 1,
        totalResults: 1,
      },
    },
  },

  get: {
    schema: ${pascal}Validation.${camel}ResponseSchema,
    example: {
      success: true,
      status: 200,
      message: ${pascal}Messages.GET_SUCCESS,
      data: ${camel}Example,
    },
  },

  create: {
    schema: ${pascal}Validation.${camel}ResponseSchema,
    example: {
      success: true,
      status: 200,
      message: ${pascal}Messages.CREATE_SUCCESS,
      data: ${camel}Example,
    },
  },

  update: {
    schema: ${pascal}Validation.${camel}ResponseSchema,
    example: {
      success: true,
      status: 200,
      message: ${pascal}Messages.UPDATE_SUCCESS,
      data: ${camel}Example,
    },
  },

  delete: {
    schema: ${pascal}Validation.delete${pascal}ResponseSchema,
    example: {
      success: true,
      status: 200,
      message: ${pascal}Messages.DELETE_SUCCESS,
      data: {},
    },
  },
};
`;

  let repository = "";

  if (db === "mongo") {
    repository = `import ${pascal}Model from "./${name}.schema.${ext}";

export const ${camel}Exist = async (data) => {
  const doc = await ${pascal}Model.findOne(data).lean();
  if (!doc) return null;
  return doc;
};

export const create${pascal}Record = async (data) => {
  const doc = await ${pascal}Model.create(data);
  return doc?.toObject ? doc.toObject() : doc;
};

export const find${pascal}ById = async (data) => {
  const doc = await ${pascal}Model.findById(data.id).lean();
  if (!doc) return null;
  return doc;
};

export const update${pascal}ById = async (data) => {
  const { id, ...updatedData } = data;
  const doc = await ${pascal}Model.findByIdAndUpdate(id, updatedData, { new: true }).lean();
  if (!doc) return null;
  return doc;
};

export const delete${pascal}ById = async (data) => {
  const doc = await ${pascal}Model.findByIdAndDelete(data.id).lean();
  if (!doc) return null;
  return doc;
};
`;
  } else if (db === "postgres") {
    repository = `import ${pascal}Model from "./${name}.schema.${ext}";

export const ${camel}Exist = async (data) => {
  const doc = await ${pascal}Model.findOne({ where: data });
  if (!doc) return null;
  return doc;
};

export const create${pascal}Record = async (data) => {
  const doc = await ${pascal}Model.create(data);
  return doc;
};

export const find${pascal}ById = async (data) => {
  const doc = await ${pascal}Model.findByPk(data.id);
  if (!doc) return null;
  return doc;
};

export const update${pascal}ById = async (data) => {
  const { id, ...updatedData } = data;
  const doc = await ${pascal}Model.findByPk(id);
  if (!doc) return null;

  await doc.update(updatedData);
  return doc;
};

export const delete${pascal}ById = async (data) => {
  const doc = await ${pascal}Model.findByPk(data.id);
  if (!doc) return null;

  await doc.destroy();
  return doc;
};
`;
  } else {
    repository = `
export const ${camel}Exist = async (_data) => null;

export const create${pascal}Record = async (data) => ({ id: "example-id", ...data });

export const find${pascal}ById = async (data) => (data?.id ? data : null);

export const update${pascal}ById = async (data) => (data?.id ? data : null);

export const delete${pascal}ById = async (data) => (data?.id ? data : null);
`;
  }

  const parsedResponseFile = `const toIsoString = (value) => {
  if (!value) return "";

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
};

export const parsed${pascal} = (item = {}) => ({
  id: item?._id ? item._id.toString() : String(item?.id ?? ""),
  ${name === "user"
      ? `name: String(item?.name ?? ""),
  email: String(item?.email ?? ""),
  role: String(item?.role ?? "user"),
  isDeleted: Boolean(item?.isDeleted ?? false),
  createdAt: toIsoString(item?.createdAt),
  updatedAt: toIsoString(item?.updatedAt),`
      : `createdAt: toIsoString(item?.createdAt),
  updatedAt: toIsoString(item?.updatedAt),`}
});

export const parsed${pascal}s = (items = []) => {
  return items.map((item) => parsed${pascal}(item));
};
`;

  let service = "";

  if (db === "mongo") {
    service = `import {
  create${pascal}Record,
  find${pascal}ById,
  update${pascal}ById,
  delete${pascal}ById,
  ${camel}Exist,
} from "./${name}.repository.${ext}";
import { logger } from "../../utils/logger.${ext}";
import { getCtx } from "../../utils/context.${ext}";
import errorResponse from "../../utils/errorResponse.${ext}";
import { mongoPaginate } from "../../middlewares/paginationMiddleware.${ext}";
import ${pascal}Model from "./${name}.schema.${ext}";
import { ${pascal}Messages } from "./${name}.messages.${ext}";
import { parsed${pascal}, parsed${pascal}s } from "./${name}.parsedResponse.${ext}";

export const create${pascal} = async (data) => {
  ${name === "user" ? `const exist = await ${camel}Exist({ email: data.email });
  if (exist) {
    logger.warn({ event: "${name}_service_error", svc: "${name}", action: "${name}_already_exist", reason: ${pascal}Messages.ALREADY_EXIST, ...getCtx() });
    throw new errorResponse(${pascal}Messages.ALREADY_EXIST, 400);
  }
` : ``}  const record = await create${pascal}Record(data);
  if (!record) {
    logger.warn({ event: "${name}_service_error", svc: "${name}", action: "create_${name}", reason: ${pascal}Messages.CREATE_FAILED, ...getCtx() });
    throw new errorResponse(${pascal}Messages.CREATE_FAILED, 400);
  }

  const parsedData = parsed${pascal}(record);

  return {
    success: true,
    status: 200,
    message: ${pascal}Messages.CREATE_SUCCESS,
    data: parsedData,
  };
};

export const list${pascal} = async (filter = {}, options = {}) => {
  const ${plural} = await mongoPaginate(${pascal}Model, filter, options);
  const parsedData = parsed${pascal}s(${plural}.data);

  return {
    success: true,
    status: 200,
    message: ${pascal}Messages.LIST_SUCCESS,
    data: {
      ...${plural},
      data: parsedData,
    },
  };
};

export const get${pascal} = async (data) => {
  const ${name} = await find${pascal}ById(data);
  if (!${name}) {
    logger.warn({ event: "${name}_service_error", svc: "${name}", action: "get_${name}", reason: "${pascal.toUpperCase()}_NOT_FOUND", ...getCtx() });
    throw new errorResponse(${pascal}Messages.NOT_FOUND, 404);
  }

  const parsedData = parsed${pascal}(${name});

  return {
    success: true,
    status: 200,
    message: ${pascal}Messages.GET_SUCCESS,
    data: parsedData,
  };
};

export const update${pascal} = async (data) => {
  const updated = await update${pascal}ById(data);
  if (!updated) {
    logger.warn({ event: "${name}_service_error", svc: "${name}", action: "update_${name}", reason: "${pascal.toUpperCase()}_NOT_FOUND", ...getCtx() });
    throw new errorResponse(${pascal}Messages.NOT_FOUND, 404);
  }

  const parsedData = parsed${pascal}(updated);

  return {
    success: true,
    status: 200,
    message: ${pascal}Messages.UPDATE_SUCCESS,
    data: parsedData,
  };
};

export const delete${pascal} = async (data) => {
  const ${name} = await delete${pascal}ById(data);
  if (!${name}) {
    logger.warn({ event: "${name}_service_error", svc: "${name}", action: "delete_${name}", reason: "${pascal.toUpperCase()}_NOT_FOUND", ...getCtx() });
    throw new errorResponse(${pascal}Messages.NOT_FOUND, 404);
  }

  return {
    success: true,
    status: 200,
    message: ${pascal}Messages.DELETE_SUCCESS,
    data: {},
  };
};
`;
  } else if (db === "postgres") {
    service = `import { logger } from "../../utils/logger.${ext}";
import { getCtx } from "../../utils/context.${ext}";
import errorResponse from "../../utils/errorResponse.${ext}";
import { sequelizePaginate } from "../../middlewares/paginationMiddleware.${ext}";
import ${pascal}Model from "./${name}.schema.${ext}";
import { ${pascal}Messages } from "./${name}.messages.${ext}";
import {
  create${pascal}Record,
  find${pascal}ById,
  update${pascal}ById,
  delete${pascal}ById,
  ${camel}Exist,
} from "./${name}.repository.${ext}";
import { parsed${pascal}, parsed${pascal}s } from "./${name}.parsedResponse.${ext}";

export const create${pascal} = async (data) => {
  ${name === "user" ? `const exist = await ${camel}Exist({ email: data.email });
  if (exist) {
    logger.warn({ event: "${name}_service_error", svc: "${name}", action: "${name}_already_exist", reason: ${pascal}Messages.ALREADY_EXIST, ...getCtx() });
    throw new errorResponse(${pascal}Messages.ALREADY_EXIST, 400);
  }
` : ``}  const record = await create${pascal}Record(data);
  if (!record) {
    logger.warn({ event: "${name}_service_error", svc: "${name}", action: "create_${name}", reason: ${pascal}Messages.CREATE_FAILED, ...getCtx() });
    throw new errorResponse(${pascal}Messages.CREATE_FAILED, 400);
  }

  const parsedData = parsed${pascal}(record);

  return {
    success: true,
    status: 200,
    message: ${pascal}Messages.CREATE_SUCCESS,
    data: parsedData,
  };
};

export const list${pascal} = async (filter = {}, options = {}) => {
  const ${plural} = await sequelizePaginate(${pascal}Model, filter, options);
  const parsedData = parsed${pascal}s(${plural}.data);

  return {
    success: true,
    status: 200,
    message: ${pascal}Messages.LIST_SUCCESS,
    data: {
      ...${plural},
      data: parsedData,
    },
  };
};

export const get${pascal} = async (data) => {
  const ${name} = await find${pascal}ById(data);
  if (!${name}) {
    logger.warn({ event: "${name}_service_error", svc: "${name}", action: "get_${name}", reason: "${pascal.toUpperCase()}_NOT_FOUND", ...getCtx() });
    throw new errorResponse(${pascal}Messages.NOT_FOUND, 404);
  }

  const parsedData = parsed${pascal}(${name});

  return {
    success: true,
    status: 200,
    message: ${pascal}Messages.GET_SUCCESS,
    data: parsedData,
  };
};

export const update${pascal} = async (data) => {
  const updated = await update${pascal}ById(data);
  if (!updated) {
    logger.warn({ event: "${name}_service_error", svc: "${name}", action: "update_${name}", reason: "${pascal.toUpperCase()}_NOT_FOUND", ...getCtx() });
    throw new errorResponse(${pascal}Messages.NOT_FOUND, 404);
  }

  const parsedData = parsed${pascal}(updated);

  return {
    success: true,
    status: 200,
    message: ${pascal}Messages.UPDATE_SUCCESS,
    data: parsedData,
  };
};

export const delete${pascal} = async (data) => {
  const deleted = await delete${pascal}ById(data);
  if (!deleted) {
    logger.warn({ event: "${name}_service_error", svc: "${name}", action: "delete_${name}", reason: "${pascal.toUpperCase()}_NOT_FOUND", ...getCtx() });
    throw new errorResponse(${pascal}Messages.NOT_FOUND, 404);
  }

  return {
    success: true,
    status: 200,
    message: ${pascal}Messages.DELETE_SUCCESS,
    data: {},
  };
};
`;
  } else {
    service = `import { ${pascal}Messages } from "./${name}.messages.${ext}";
import {
  create${pascal}Record,
  find${pascal}ById,
  update${pascal}ById,
  delete${pascal}ById,
} from "./${name}.repository.${ext}";
import { parsed${pascal} } from "./${name}.parsedResponse.${ext}";

export const create${pascal} = async (data) => {
  const record = await create${pascal}Record(data);
  return {
    success: true,
    status: 200,
    message: ${pascal}Messages.CREATE_SUCCESS,
    data: parsed${pascal}(record),
  };
};

export const list${pascal} = async (_filter = {}, options = {}) => ({
  success: true,
  status: 200,
  message: ${pascal}Messages.LIST_SUCCESS,
  data: {
    data: [],
    page: Number(options.page ?? 1),
    limit: Number(options.limit ?? 10),
    totalPages: 0,
    totalResults: 0,
  },
});

export const get${pascal} = async (data) => {
  const record = await find${pascal}ById(data);
  return {
    success: true,
    status: 200,
    message: ${pascal}Messages.GET_SUCCESS,
    data: parsed${pascal}(record ?? data),
  };
};

export const update${pascal} = async (data) => {
  const record = await update${pascal}ById(data);
  return {
    success: true,
    status: 200,
    message: ${pascal}Messages.UPDATE_SUCCESS,
    data: parsed${pascal}(record ?? data),
  };
};

export const delete${pascal} = async (data) => {
  await delete${pascal}ById(data);
  return {
    success: true,
    status: 200,
    message: ${pascal}Messages.DELETE_SUCCESS,
    data: {},
  };
};
`;
  }

  const controller = `import { asyncHandler } from "../../utils/asyncHandler.${ext}";
import { sendSuccess } from "../../utils/globalResponse.${ext}";
import {
  create${pascal},
  list${pascal},
  get${pascal},
  update${pascal},
  delete${pascal},
} from "./${name}.service.${ext}";

export const create${pascal}Handler = asyncHandler(
  async (req, res) => {
    const record = await create${pascal}(req.body);
    return sendSuccess(res, record.status, record.message, record.data);
  },
  { ctrl: "${name}", action: "create_${name}" }
);

export const list${pascal}Handler = asyncHandler(
  async (req, res) => {
    const { page, limit } = req.query;
    const filter = {};
    const options = { page, limit };

    const record = await list${pascal}(filter, options);
    return sendSuccess(res, record.status, record.message, record.data);
  },
  { ctrl: "${name}", action: "list_${name}" }
);

export const get${pascal}Handler = asyncHandler(
  async (req, res) => {
    const record = await get${pascal}(req.params);
    return sendSuccess(res, record.status, record.message, record.data);
  },
  { ctrl: "${name}", action: "get_${name}" }
);

export const update${pascal}Handler = asyncHandler(
  async (req, res) => {
    const record = await update${pascal}({ ...req.body, id: req.query.id });
    return sendSuccess(res, record.status, record.message, record.data);
  },
  { ctrl: "${name}", action: "update_${name}" }
);

export const delete${pascal}Handler = asyncHandler(
  async (req, res) => {
    const record = await delete${pascal}(req.body);
    return sendSuccess(res, record.status, record.message, record.data);
  },
  { ctrl: "${name}", action: "delete_${name}" }
);
`;

  const routes = `import { createAutoRouter } from "../../docs/auto.router.${ext}";
import { validate } from "../../middlewares/validate.${ext}";
import { withSwagger } from "../../docs/swagger.registry.${ext}";
import { ${pascal}Validation } from "./${name}.validation.${ext}";
import { ${pascal}Docs } from "./${name}.docs.${ext}";
import {
  create${pascal}Handler,
  list${pascal}Handler,
  get${pascal}Handler,
  update${pascal}Handler,
  delete${pascal}Handler,
} from "./${name}.controller.${ext}";

const router = createAutoRouter("/${plural}", "${pascal}s");

router.get(
  "/",
  validate(${pascal}Validation.getAll${pascal}sValidation),
  withSwagger(list${pascal}Handler, {
    summary: "List ${plural}",
    description: "Returns the list of ${plural}",
    auth: true,
    response: ${pascal}Docs.list.schema,
    responseExample: ${pascal}Docs.list.example,
  })
);

router.post(
  "/",
  validate(${pascal}Validation.createValidation),
  withSwagger(create${pascal}Handler, {
    summary: "Create ${name}",
    description: "Creates a new ${name}",
    auth: true,
    response: ${pascal}Docs.create.schema,
    responseExample: ${pascal}Docs.create.example,
    errors: [409],
  })
);

router.get(
  "/:id",
  validate(${pascal}Validation.get${pascal}ByIdValidation),
  withSwagger(get${pascal}Handler, {
    summary: "Get ${name} by id",
    description: "Returns a single ${name} by id",
    auth: true,
    response: ${pascal}Docs.get.schema,
    responseExample: ${pascal}Docs.get.example,
    errors: [404],
  })
);

router.patch(
  "/",
  validate(${pascal}Validation.update${pascal}ByIdValidation),
  withSwagger(update${pascal}Handler, {
    summary: "Update ${name}",
    description: "Updates a ${name}",
    auth: true,
    response: ${pascal}Docs.update.schema,
    responseExample: ${pascal}Docs.update.example,
    errors: [404, 409],
  })
);

router.delete(
  "/",
  validate(${pascal}Validation.deleteValidation),
  withSwagger(delete${pascal}Handler, {
    summary: "Delete ${name}",
    description: "Deletes a ${name}",
    auth: true,
    response: ${pascal}Docs.delete.schema,
    responseExample: ${pascal}Docs.delete.example,
    errors: [404],
  })
);

export default router;
`;

  const files = {
    [`${moduleBasePath}/${name}.schema.${ext}`]: schema,
    [`${moduleBasePath}/${name}.messages.${ext}`]: messagesFile,
    [`${moduleBasePath}/${name}.validation.${ext}`]: validationFile,
    [`${moduleBasePath}/${name}.parsedResponse.${ext}`]: parsedResponseFile,
    [`${moduleBasePath}/${name}.docs.${ext}`]: docsFile,
    [`${moduleBasePath}/${name}.repository.${ext}`]: repository,
    [`${moduleBasePath}/${name}.service.${ext}`]: service,
    [`${moduleBasePath}/${name}.controller.${ext}`]: controller,
    [`${moduleBasePath}/${name}.routes.${ext}`]: routes,
  };

  return {
    module: { name, camel, pascal, plural },
    files,
  };
}
/* ---------------------------
   Create modules + mount routes
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


});

fs.writeFileSync(routesFilePath, routesContent, "utf8");

/* ---------------------------
   package.json (PINNED VERSIONS)
---------------------------- */
const pkgJsonPath = path.join(base, "package.json");
if (!fs.existsSync(pkgJsonPath)) {
  const deps = {
    express: "^4.19.2",
    zod: "^3.24.4",
    dotenv: "^16.4.0",
    pino: "^9.0.0",
    "pino-pretty": "^11.0.0",
    jsonwebtoken: "^9.0.2",

    multer: "^1.4.5",
    "mime-types": "^2.1.35",
    "cookie-parser": "^1.4.7",
    helmet: "^8.1.0",
    "express-mongo-sanitize": "^2.2.0",
    hpp: "^0.2.3",
    cors: "^2.8.5",
    "express-rate-limit": "^7.5.0",
    "swagger-ui-express": "^5.0.1",
    "zod-to-json-schema": "^3.24.6",
  };

  if (db === "mongo") deps.mongoose = "^7.6.0";
  if (db === "postgres") {
    deps.sequelize = "^6.37.7";
    deps.pg = "^8.11.0";
    deps["pg-hstore"] = "^2.3.4";
  }

  const scripts = {
    dev: "nodemon --legacy-watch --watch src --watch server.mjs --ext mjs,json server.mjs",
    start: "node server.mjs",
  };

  const devDependencies = {
    nodemon: "^3.1.10",
  };


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

console.log(`Backend (.mjs) structure created successfully`);
console.log(`DB mode: ${db}`);
if (modules.length) console.log(`Features created: ${modules.join(", ")}`);

console.log("Next steps:");
console.log(`1. Go to your project folder: cd ${projectName}`);
console.log("2. Install dependencies: npm i");

if (db === "postgres") {
  console.log("3. Open the .env file and set DATABASE_URL to your Postgres connection string.");
  console.log("4. Start the app with npm run dev.");
  console.log("5. Sequelize models will sync automatically when the app starts.");
}
if (db === "mongo") {
  console.log("3. Open the .env file and set MONGO_URI to your MongoDB connection string.");
  console.log("4. Start the app with npm run dev.");
}
