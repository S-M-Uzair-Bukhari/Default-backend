/**
 * generators/create-backend.mts
 * ✅ TS generator -> outputs .mts backend scaffold (ESM / NodeNext)
 *
 * Dev:   npm run dev  (tsx watch src/server.mts)
 * Build: npm run build (tsc -> dist/*.mjs)
 * Start: npm start (node dist/server.mjs)
 *
 * DB: --db none | mongo | postgres
 * Modules: --modules user,post
 *
 * Requirements:
 * - ✅ No buildListOptions util file
 * - ✅ Controllers: const filter = {}; const options = {};
 * - ✅ Services: call paginate helpers (mongoPaginate / prismaPaginate)
 * - ✅ sendSuccess(res, status, message, data)
 * - ✅ Services return { success, status, message, data }
 * - ✅ No pagination middleware usage in routes
 * - ✅ Each module includes Messages file
 * - ✅ Prisma slow query logger
 * - ✅ Mongoose slow query plugin
 * - ✅ uploadMiddleware.mts included
 * - ✅ user.types.mts added for user module
 * - ✅ delete _req/_res naming (use req, res)
 * - ✅ FIXED: Routes use params only for GET /:id (as you want)
 *
 *  Examples:
 *  node .\generators\typeScript-backend.mts my-api --db mongo --modules user,post
 *  node .\generators\typeScript-backend.mts my-api --db postgres --modules user,post
 */

import fs from "node:fs";
import path from "node:path";

/* ---------------------------
   CLI args
---------------------------- */
const projectName = process.argv[2];
if (!projectName) {
  console.log(
    "Usage: npx tsx generators/create-backend.mts <projectName> --db mongo|postgres|none --modules user,post"
  );
  process.exit(1);
}

function getArgValue(flag: string) {
  const i = process.argv.indexOf(flag);
  if (i === -1) return null;
  return process.argv[i + 1] ?? null;
}

const modulesArg = getArgValue("--modules");
let modules = modulesArg
  ? modulesArg
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean)
  : [];

const db = (getArgValue("--db") || "none").toLowerCase();
if (!["mongo", "postgres", "none"].includes(db)) {
  console.log("Invalid --db value. Use: mongo | postgres | none");
  process.exit(1);
}

// If DB is mongo/postgres, auth middleware expects a user module.
if ((db === "mongo" || db === "postgres") && !modules.includes("user")) {
  modules = ["user", ...modules];
}

const ext = "mts";
const base = path.join(process.cwd(), projectName);

/* ---------------------------
   Helpers
---------------------------- */
function ensureDir(dirPath: string) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeFile(relPath: string, content: string) {
  const fullPath = path.join(base, relPath);
  ensureDir(path.dirname(fullPath));
  fs.writeFileSync(fullPath, content, "utf8");
}

function appendFile(relPath: string, content: string) {
  const fullPath = path.join(base, relPath);
  ensureDir(path.dirname(fullPath));
  fs.appendFileSync(fullPath, content, "utf8");
}

function toKebab(str: string) {
  return str
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replace(/[\s_]+/g, "-")
    .toLowerCase();
}

function toCamel(str: string) {
  const s = str.replace(/[-_\s]+(.)?/g, (_: string, c: string) =>
    c ? c.toUpperCase() : ""
  );
  return s.charAt(0).toLowerCase() + s.slice(1);
}

function toPascal(str: string) {
  const c = toCamel(str);
  return c.charAt(0).toUpperCase() + c.slice(1);
}

function pluralize(name: string) {
  if (name.endsWith("s")) return name;
  if (name.endsWith("y")) return name.slice(0, -1) + "ies";
  return name + "s";
}

/* ---------------------------
   Base folders
---------------------------- */
[
  "src/config",
  "src/modules",
  "src/middlewares",
  "src/utils",
  "src/types",
  "uploads",
].forEach((folder) => ensureDir(path.join(base, folder)));

if (db === "postgres") ensureDir(path.join(base, "prisma"));

/* ---------------------------
   TS config
---------------------------- */
writeFile(
  "tsconfig.json",
  `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "moduleResolution": "NodeNext",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "allowImportingTsExtensions": true
  },
  "include": ["src/**/*.mts"],
  "exclude": ["node_modules", "dist"]
}
`
);

/* ---------------------------
   Slow Query Loggers
---------------------------- */
function getMongooseSlowQueriesFile() {
  return `import { logger } from "../utils/logger.${ext}";
import { getCtx } from "../utils/context.${ext}";
import type mongoose from "mongoose";

export default function logSlowQueries(thresholdMs = 200) {
  return function (schema: mongoose.Schema) {
    schema.pre(
      /^(find|count|update|delete|aggregate|findById|findOneAnd|insertMany)/,
      function () {
        // @ts-ignore
        this._startAt = Date.now();
      }
    );

    schema.post(
      /^(find|count|update|delete|aggregate|findById|findOneAnd|insertMany)/,
      function () {
        // @ts-ignore
        const ms = Date.now() - (this._startAt || Date.now());

        if (ms > thresholdMs) {
          // @ts-ignore
          const modelName = this.model?.modelName;

          logger.warn({
            event: "db_slow_query",
            model: modelName,
            // @ts-ignore
            op: this.op,
            // @ts-ignore
            cond: this.getQuery?.(),
            // @ts-ignore
            options: this.getOptions?.(),
            ms,
            ...getCtx(),
          });
        }
      }
    );

    schema.pre("save", function () {
      // @ts-ignore
      this._startAt = Date.now();
    });

    schema.post("save", function (doc: any) {
      // @ts-ignore
      const ms = Date.now() - (this._startAt || Date.now());

      if (ms > thresholdMs) {
        logger.warn({
          event: "db_slow_save",
          // @ts-ignore
          model: this.constructor?.modelName,
          id: doc?._id,
          ms,
          ...getCtx(),
        });
      }
    });
  };
}
`;
}

function getPrismaSlowQueriesFile() {
  return `import { logger } from "../utils/logger.${ext}";
import { getCtx } from "../utils/context.${ext}";
import type { PrismaClient } from "../generated/prisma/client.${ext}";

export const attachPrismaSlowQueryLogger = <T extends PrismaClient>(prisma: T, thresholdMs = 200) => {
  return prisma.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const start = Date.now();

          try {
            const result = await query(args);
            const ms = Date.now() - start;

            if (ms > thresholdMs) {
              logger.warn({
                event: "db_slow_query",
                orm: "prisma",
                model,
                action: operation,
                ms,
                ...getCtx(),
              });
            }

            return result;
          } catch (err: any) {
            const ms = Date.now() - start;

            logger.error({
              event: "db_query_error",
              orm: "prisma",
              model,
              action: operation,
              ms,
              message: err?.message,
              stack: err?.stack,
              ...getCtx(),
            });

            throw err;
          }
        },
      },
    },
  });
};
`;
}

/* ---------------------------
   Pagination helpers
---------------------------- */
function mongoPaginationFileExactTS() {
  return `export const escapeRegExp = (s: unknown = "") => {
  return String(s).replace(/[.*+?^$()|[\\]\\\\]/g, "\\\\$&");
};

export async function mongoPaginate(model: any, filter: any = {}, options: any = {}, skipPagination = false) {
  const findFilter: any = { ...(filter || {}) };

  if (options?.search && Array.isArray(options.searchFields) && options.searchFields.length) {
    const value = String(options.search).trim();
    if (value) {
      const mode = options.searchMode === "startsWith" ? "^" : "";
      const regex = new RegExp(\`\${mode}\${escapeRegExp(value)}\`, "i");
      findFilter.$or = (findFilter.$or || []).concat(options.searchFields.map((f: string) => ({ [f]: regex })));
    }
  }

  let sort = "";
  if (options?.sortBy) {
    const pieces = String(options.sortBy).split(",");
    const fields: string[] = [];
    for (const p of pieces) {
      const [key, order] = p.split(":");
      fields.push((order && order.toLowerCase() === "desc" ? "-" : "") + key);
    }
    sort = fields.join(" ");
  } else {
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
          .map((p: string) => p.trim())
          .filter(Boolean);

    for (const pop of populates) {
      if (typeof pop === "string") {
        const nested = pop.split(".").reduceRight((acc: any, path: string) => (acc ? { path, populate: acc } : { path }), null);
        q = q.populate(nested);
      } else if (pop && typeof pop === "object") {
        q = q.populate(pop);
      }
    }
  }

  const [totalResults, docs] = await Promise.all([countPromise, q.exec()]);
  const totalPages = skipPagination ? 0 : Math.ceil(totalResults / limit);

  const data = docs.map((doc: any) =>
    options?.currentUserId && typeof doc.toJSON === "function"
      ? doc.toJSON({ currentUserId: options.currentUserId })
      : typeof doc.toJSON === "function"
      ? doc.toJSON()
      : doc
  );

  return { data, page, limit, totalPages, totalResults };
}

export function isMongooseModel(m: any) {
  return !!(m && typeof m.find === "function" && m.collection);
}
`;
}

function prismaPaginateFileTS() {
  return `const parseSort = (sortBy: unknown) => {
  if (!sortBy) return [{ createdAt: "desc" }];

  const pieces = String(sortBy)
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);

  const orderBy: any[] = [];
  for (const p of pieces) {
    const [field, order] = p.split(":");
    if (!field) continue;
    orderBy.push({
      [field]: (order || "desc").toLowerCase() === "asc" ? "asc" : "desc",
    });
  }

  return orderBy.length ? orderBy : [{ createdAt: "desc" }];
};

export const prismaPaginate = async (delegate: any, filter: any = {}, options: any = {}, skipPagination = false) => {
  const where: any = { ...(filter || {}) };
  const opts: any = { ...(options || {}) };

  if (opts?.search && Array.isArray(opts.searchFields) && opts.searchFields.length) {
    const raw = String(opts.search).trim();
    if (raw) {
      const mode = opts.searchMode === "startsWith" ? "startsWith" : "contains";
      const searchGroup = {
        OR: opts.searchFields.map((f: string) => ({
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
   Upload Middleware (TS)
---------------------------- */
function uploadMiddlewareTemplateTS() {
  return `import multer from "multer";
import mimetype from "mime-types";
import path from "path";
import fs from "fs";
import type { Response, Request, NextFunction } from "express";
import type { Field, FileFilterCallback } from "multer";

const limits = {
  imageSize: 5 * 1024 * 1024,
  videoSize: 500 * 1024 * 1024,
  pdfSize: 10 * 1024 * 1024,
  vectorSize: 20 * 1024 * 1024,
  mediaSize: 500 * 1024 * 1024,
};

const codedError = (code: string, status: number = 400, extra: object = {}) => {
  const e = new Error();
  return Object.assign(e, { code, status, ...extra });
};

const forwardMulter = (mw: any) => (req: Request, res: Response, next: NextFunction) => {
  mw(req, res, (e: any) => next(e));
};

const imageFilter = (req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
  void req;
  if (file.mimetype?.startsWith("image/")) return cb(null, true);
  return cb(
    codedError("IMAGE_INVALID_MIMETYPE", 400, {
      field: file.fieldname,
      mimetype: file.mimetype,
      allowedPrefix: "image/",
    }) as any,
    false
  );
};

const videoFilter = (req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
  void req;
  if (file.mimetype?.startsWith("video/")) return cb(null, true);
  return cb(
    codedError("VIDEO_INVALID_MIMETYPE", 400, {
      field: file.fieldname,
      mimetype: file.mimetype,
      allowedPrefix: "video/",
    }) as any,
    false
  );
};

const pdfFilter = (req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
  void req;
  if (file.mimetype?.startsWith("application/pdf")) return cb(null, true);
  return cb(
    codedError("PDF_INVALID_MIMETYPE", 400, {
      field: file.fieldname,
      mimetype: file.mimetype,
      allowedPrefix: "application/pdf",
    }) as any,
    false
  );
};

const imageVideoFilter = (req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
  void req;
  if (file.mimetype?.startsWith("image/") || file.mimetype?.startsWith("video/")) return cb(null, true);
  return cb(
    codedError("IMAGE_VIDEO_INVALID_MIMETYPE", 400, {
      field: file.fieldname,
      mimetype: file.mimetype,
      allowedPrefix: "image/ or video/",
    }) as any,
    false
  );
};

const imagePDFFilter = (req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
  void req;
  if (file.mimetype?.startsWith("image/") || file.mimetype?.startsWith("application/pdf")) return cb(null, true);
  return cb(
    codedError("IMAGE_PDF_INVALID_MIMETYPE", 400, {
      field: file.fieldname,
      mimetype: file.mimetype,
      allowedPrefix: "image/ or application/pdf",
    }) as any,
    false
  );
};

const ensureDir = (dirPath: string) => {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    void req;

    let uploadPath: string;

    if (file.mimetype.startsWith("image/")) {
      uploadPath = path.join(path.resolve(), "uploads", "images");
    } else if (file.mimetype.startsWith("video/")) {
      uploadPath = path.join(path.resolve(), "uploads", "videos");
    } else {
      uploadPath = path.join(path.resolve(), "uploads", "docs");
    }

    ensureDir(uploadPath);
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    void req;
    const ext = mimetype.extension(file.mimetype) || "bin";
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9) + "." + ext;
    cb(null, \`\${file.fieldname}-\${uniqueSuffix}\`);
  },
});

const uploadImage = multer({ storage, fileFilter: imageFilter, limits: { fileSize: limits.imageSize } });
const uploadVideo = multer({ storage, fileFilter: videoFilter, limits: { fileSize: limits.videoSize } });
const uploadPDFDOC = multer({ storage, fileFilter: pdfFilter, limits: { fileSize: limits.pdfSize } });
const uploadImageVideo = multer({ storage, fileFilter: imageVideoFilter, limits: { fileSize: limits.imageSize + limits.videoSize } });
const uploadImagePDF = multer({ storage, fileFilter: imagePDFFilter, limits: { fileSize: limits.imageSize + limits.pdfSize } });

export const uploadSingleImage = (field: string) => forwardMulter(uploadImage.single(field));
export const uploadArrayImage = (field: string) => forwardMulter(uploadImage.array(field));
export const uploadMultpleImageFields = (fields: Field[]) => forwardMulter(uploadImage.fields(fields));

export const uploadSingleVideo = (field: string) => forwardMulter(uploadVideo.single(field));
export const uploadArrayVideo = (field: string) => forwardMulter(uploadVideo.array(field));
export const uploadMultpleVideoFields = (fields: Field[]) => forwardMulter(uploadVideo.fields(fields));

export const uploadSinglePDF = (field: string) => forwardMulter(uploadPDFDOC.single(field));
export const uploadArrayPDF = (field: string) => forwardMulter(uploadPDFDOC.array(field));
export const uploadMultplePDFFields = (fields: Field[]) => forwardMulter(uploadPDFDOC.fields(fields));

export const uploadSingleImageVideo = (field: string) => forwardMulter(uploadImageVideo.single(field));
export const uploadArrayImageVideo = (field: string) => forwardMulter(uploadImageVideo.array(field));
export const uploadMultpleImageVideoFields = (fields: Field[]) => forwardMulter(uploadImageVideo.fields(fields));

export const uploadSingleImagePDF = (field: string) => forwardMulter(uploadImagePDF.single(field));
export const uploadArrayImagePDF = (field: string) => forwardMulter(uploadImagePDF.array(field));
export const uploadMultpleImagePDFFields = (fields: Field[]) => forwardMulter(uploadImagePDF.fields(fields));

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
  } catch (err: any) {
    logger.error({
      event: "mongoose_connection_failed",
      message: err?.message,
      stack: err?.stack,
    });

    if (env.NODE_ENV !== "production") setTimeout(connectDB, 5000);
    else process.exit(1);
  }
};

const handleExit = (signal: string) => {
  logger.info({ event: "mongoose_connection_close", signal });

  mongoose.connection
    .close()
    .then(() => process.exit(0))
    .catch((e: any) => {
      logger.error({ event: "mongoose_connection_close_error", message: e?.message });
      process.exit(1);
    });
};

process.on("SIGINT", handleExit);
process.on("SIGTERM", handleExit);
`
    : db === "postgres"
      ? `import { PrismaClient } from "../generated/prisma/client.mts";
import { PrismaPg } from "@prisma/adapter-pg";
import env from "./env.${ext}";
import { logger } from "../utils/logger.${ext}";
import { attachPrismaSlowQueryLogger } from "./logSlowQueries.${ext}";

export const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: String(env.DATABASE_URL),
  }),
});

attachPrismaSlowQueryLogger(prisma, Number(env.SLOW_QUERY_MS || 200));

export const connectDB = async () => {
  await prisma.$connect();
  logger.info({ event: "db_connected", db: "postgres" });
};
`
      : `export const connectDB = async () => { return; };
`;

/* ---------------------------
   Server file (src/server.mts)
---------------------------- */
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
    : `import app from "./app.${ext}";
import env from "./config/env.${ext}";

const PORT = env.PORT || 5000;

app.listen(PORT, () => {
  console.log(\`Server running on \${PORT}\`);
});
`;

/* ---------------------------
   Auth middleware (DB aware)
---------------------------- */
function authMiddlewareTemplateTS() {
  if (db === "mongo") {
    return `import jwt from "jsonwebtoken";
import errorResponse from "../utils/errorResponse.${ext}";
import { bindToContext, getCtx } from "../utils/context.${ext}";
import { logger } from "../utils/logger.${ext}";
import env from "../config/env.${ext}";
import UserModel from "../modules/user/user.schema.${ext}";
import type { Request, Response, NextFunction } from "express";

export const protect = async (req: Request, res: Response, next: NextFunction) => {
  void res;

  let token: string | undefined;

  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer ")) token = auth.split(" ")[1];

  if (!token) {
    logger.warn({ event: "auth_missing_token", path: req.originalUrl, ...getCtx() });
    return next(new errorResponse("Not authorized to access this route, token missing", 401));
  }

  try {
    const decoded: any = jwt.verify(token, env.JWT_SECRET as string);

    if (decoded.exp && decoded.exp < Math.floor(Date.now() / 1000)) {
      logger.warn({ event: "auth_token_expired", sub: decoded.sub, ...getCtx() });
      return next(new errorResponse("Token has expired", 401));
    }

    const user = await UserModel.findOne({ _id: decoded.sub, isDeleted: false }).lean();
    if (!user) {
      logger.warn({ event: "auth_user_not_found", sub: decoded.sub, ...getCtx() });
      return next(new errorResponse("Not authorized to access this route, user not found", 401));
    }

    // @ts-ignore
    req.user = user;
    // @ts-ignore
    req.token = token;
    // @ts-ignore
    req.tokenData = decoded;

    bindToContext({ userId: String(user._id), role: user.role });

    logger.debug({ event: "auth_ok", sub: decoded.sub, role: user.role, ...getCtx() });
    next();
  } catch (err: any) {
    if (err?.name === "TokenExpiredError") {
      logger.warn({ event: "auth_token_expired_throw", message: err.message, ...getCtx() });
      return next(new errorResponse("Token expired, please log in again", 401));
    }

    if (err?.name === "JsonWebTokenError") {
      logger.warn({ event: "auth_invalid_token", message: err.message, ...getCtx() });
      return next(new errorResponse("Invalid token, please log in again", 401));
    }

    logger.error({ event: "auth_error", message: err?.message, stack: err?.stack, ...getCtx() });
    return next(new errorResponse("Not authorized to access this route", 401));
  }
};

export const authorize = (...roles: string[]) => (req: Request, res: Response, next: NextFunction) => {
  void res;

  // @ts-ignore
  const role = req.user?.role;
  if (!role || !roles.includes(role)) {
    logger.warn({ event: "authz_denied", required: roles, role, path: req.originalUrl, ...getCtx() });
    return next(new errorResponse(\`Access denied: role \${role} not allowed\`, 403));
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
import type { Request, Response, NextFunction } from "express";

export const protect = async (req: Request, res: Response, next: NextFunction) => {
  void res;

  let token: string | undefined;

  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer ")) token = auth.split(" ")[1];

  if (!token) {
    logger.warn({ event: "auth_missing_token", path: req.originalUrl, ...getCtx() });
    return next(new errorResponse("Not authorized to access this route, token missing", 401));
  }

  try {
    const decoded: any = jwt.verify(token, env.JWT_SECRET as string);

    if (decoded.exp && decoded.exp < Math.floor(Date.now() / 1000)) {
      logger.warn({ event: "auth_token_expired", sub: decoded.sub, ...getCtx() });
      return next(new errorResponse("Token has expired", 401));
    }

    const user = await prisma.user.findUnique({ where: { id: decoded.sub } });

    if (!user || user.isDeleted) {
      logger.warn({ event: "auth_user_not_found", sub: decoded.sub, ...getCtx() });
      return next(new errorResponse("Not authorized to access this route, user not found", 401));
    }

    // @ts-ignore
    req.user = user;
    // @ts-ignore
    req.token = token;
    // @ts-ignore
    req.tokenData = decoded;

    bindToContext({ userId: String(user.id), role: user.role });

    logger.debug({ event: "auth_ok", sub: decoded.sub, role: user.role, ...getCtx() });
    next();
  } catch (err: any) {
    if (err?.name === "TokenExpiredError") {
      logger.warn({ event: "auth_token_expired_throw", message: err.message, ...getCtx() });
      return next(new errorResponse("Token expired, please log in again", 401));
    }

    if (err?.name === "JsonWebTokenError") {
      logger.warn({ event: "auth_invalid_token", message: err.message, ...getCtx() });
      return next(new errorResponse("Invalid token, please log in again", 401));
    }

    logger.error({ event: "auth_error", message: err?.message, stack: err?.stack, ...getCtx() });
    return next(new errorResponse("Not authorized to access this route", 401));
  }
};

export const authorize = (...roles: string[]) => (req: Request, res: Response, next: NextFunction) => {
  void res;

  // @ts-ignore
  const role = req.user?.role;
  if (!role || !roles.includes(role)) {
    logger.warn({ event: "authz_denied", required: roles, role, path: req.originalUrl, ...getCtx() });
    return next(new errorResponse(\`Access denied: role \${role} not allowed\`, 403));
  }
  next();
};
`;
  }

  return `import errorResponse from "../utils/errorResponse.${ext}";
import type { Request, Response, NextFunction } from "express";

export const protect = async (req: Request, res: Response, next: NextFunction) => {
  void req; void res;
  return next(new errorResponse("Auth middleware requires --db mongo or --db postgres", 500));
};

export const authorize = (...roles: string[]) => (req: Request, res: Response, next: NextFunction) => {
  void roles; void req; void res;
  return next(new errorResponse("Auth middleware requires --db mongo or --db postgres", 500));
};
`;
}

/* ---------------------------
   Shared files
---------------------------- */
const sharedFiles: Record<string, string> = {
  [`src/app.${ext}`]: `import express from "express";
import routes from "./routes.${ext}";
import { requestContext } from "./utils/context.${ext}";
import requestLogger from "./middlewares/requestLogger.${ext}";
import { errorMiddleware } from "./middlewares/errorMiddleware.${ext}";

const app = express();

app.use(requestContext);
app.use(requestLogger);
app.use(express.json());

app.get("/health", (req, res) => {
  void req;
  return res.json({ ok: true });
});

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

  ...(db === "mongo" ? { [`src/config/logSlowQueries.${ext}`]: getMongooseSlowQueriesFile() } : {}),
  ...(db === "postgres" ? { [`src/config/logSlowQueries.${ext}`]: getPrismaSlowQueriesFile() } : {}),

  ...(db === "postgres"
    ? {
      "prisma.config.ts": `import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
`,
    }
    : {}),

  [`src/utils/context.${ext}`]: `import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

type Ctx = {
  requestId?: string;
  ip?: string;
  ua?: string;
  userId?: string;
  role?: string;
};

const als = new AsyncLocalStorage<Ctx>();

export const getCtx = () => als.getStore() || {};

export const requestContext = (req: any, res: any, next: any) => {
  const requestId = req.get?.("x-request-id") || randomUUID();
  const ctx: Ctx = { requestId, ip: req.ip, ua: req.get?.("user-agent") };

  als.run(ctx, () => {
    res.setHeader?.("x-request-id", requestId);
    next();
  });
};

export const bindToContext = (patch: Partial<Ctx> = {}) => {
  const store = als.getStore();
  if (store) Object.assign(store, patch);
};
`,

  [`src/utils/logger.${ext}`]: `import pino from "pino";
import env from "../config/env.${ext}";

const isDev = env.NODE_ENV !== "production";

export const logger = pino({
  level: env.LOG_LEVEL || (isDev ? "debug" : "info"),
  base: { service: "api", env: env.NODE_ENV, commit: env.COMMIT_SHA },
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
  transport: isDev ? { target: "pino-pretty", options: { colorize: true, translateTime: "SYS:standard" } } : undefined,
  serializers: { err: pino.stdSerializers.err },
  timestamp: pino.stdTimeFunctions.isoTime,
});
`,

  [`src/utils/asyncHandler.${ext}`]: `import { Request, Response, NextFunction} from "express";
import { ParamsDictionary } from "express-serve-static-core";
import { ParsedQs } from "qs";

export function asyncHandler<
  P = ParamsDictionary,
  ResBody = any,
  ReqBody = any,
  ReqQuery = ParsedQs
>(
  fn: (
    req: Request<P, ResBody, ReqBody, ReqQuery>,
    res: Response,
    next: NextFunction
  ) => Promise<any>,
  meta?: { ctrl: string; action: string }
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req as any, res, next)).catch(next);
  };
}
`,

  [`src/utils/globalResponse.${ext}`]: `import type { Response } from "express";

export const sendSuccess = (res: Response, statusCode = 200, message = "Success", data: any = {}) => {
  return res.status(statusCode).json({
    success: true,
    status: statusCode,
    message,
    data,
  });
};
`,

  [`src/utils/errorResponse.${ext}`]: `class errorResponse extends Error {
  status: number;
  data: any;

  constructor(message: string, status: number, data: any = {}) {
    super(message);
    this.status = status;
    this.data = data;
    Error.captureStackTrace(this, this.constructor);
  }
}

export default errorResponse;
`,

  [`src/middlewares/requestLogger.${ext}`]: `import { logger } from "../utils/logger.${ext}";
import { getCtx } from "../utils/context.${ext}";
import type { Request, Response, NextFunction } from "express";

export default function requestLogger(req: Request, res: Response, next: NextFunction) {
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

  [`src/middlewares/errorMiddleware.${ext}`]: `import env from "../config/env.${ext}";
import { logger } from "../utils/logger.${ext}";
import { getCtx } from "../utils/context.${ext}";
import type { Request, Response, NextFunction } from "express";

export const errorMiddleware = (err: any, req: Request, res: Response, next: NextFunction) => {
  void next;

  let status = Number(err?.status || 500);
  let message = err?.message || err?.code || "Internal Server Error";
  let data = err?.data || {};

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
};
`,

  [`src/middlewares/validate.${ext}`]: `import { z, ZodType } from "zod";
import errorResponse from "../utils/errorResponse.${ext}";
import { logger } from "../utils/logger.${ext}";
import type { Request, Response, NextFunction } from "express";
import type { ParamsDictionary, Query } from "express-serve-static-core";

export interface extendedParams extends ParamsDictionary {
  [key: string]: any;
}

export interface extendedQuery extends Query {
  [key: string]: any;
}

export interface RequestSchemas {
  body?: ZodType;
  query?: ZodType<extendedQuery>;
  params?: ZodType<extendedParams>;
  files?: ZodType<Express.Multer.File[]>;
  file?: ZodType<Express.Multer.File>;
}

export const validate =
  (schema: RequestSchemas) =>
  (req: Request, res: Response, next: NextFunction) => {
    try {
      if (schema.body) {
        const hasBody = isNonEmptyPlainObject(req.body);
        const hasFile = !!req.file;
        const hasFiles = !!req.files && !isEmptyFiles(req.files);

        if (!hasBody && !hasFile && !hasFiles) {
          return next(
            new errorResponse("One or more fields are required", 400),
          );
        }
        const result = schema.body.safeParse(req.body);
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
      if (schema.files) {
        const incomingFiles = req.files;
        if (incomingFiles && !isEmptyFiles(incomingFiles)) {
          const result = schema.files.safeParse(incomingFiles);
          if (!result.success) return handleZodError(result.error, next);
          req.files = result.data;
        }
      }

      if (schema.file) {
        const incomingFile = req.file;
        if (!incomingFile) {
          return next(new errorResponse("Media file is required", 400));
        }
        const result = schema.file.safeParse(incomingFile);
        if (!result.success) return handleZodError(result.error, next);
        req.file = result.data;
      }
      next();
    } catch (error: any) {
      logger.warn({
        event: "Validation_error",
        path: req.originalUrl,
        method: req.method,
        body: req.body,
        query: req.query,
        params: req.params,
        files: req.files,
        message: error.message,
      });
      console.error("Unhandled validation Error", error);
      next(error);
    }
  };

function handleZodError(error: z.ZodError, next: NextFunction) {
  if (error instanceof z.ZodError) {
    const details = error.issues.map((e) => ({
      path: e?.path?.length ? e.path.join(".") : "",
      message: e.message,
    }));
    return next(new errorResponse("validation Error", 400, details));
  }
  return next(error);
}

function isNonEmptyPlainObject(value: unknown): value is Record<string, any> {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).length > 0
  );
}

function isEmptyFiles(files: unknown) {
  if (Array.isArray(files)) return files.length === 0;

  if (files && typeof files === "object") {
    return Object.values(files).every(
      (arr) => !Array.isArray(arr) || arr.length === 0,
    );
  }
  return true;
}
`,

  [`src/middlewares/auth.${ext}`]: authMiddlewareTemplateTS(),

  [`src/middlewares/uploadMiddleware.${ext}`]: uploadMiddlewareTemplateTS(),

  ...(db === "mongo"
    ? { [`src/middlewares/paginationMiddleware.${ext}`]: mongoPaginationFileExactTS() }
    : {}),
  ...(db === "postgres"
    ? { [`src/middlewares/paginationMiddleware.${ext}`]: prismaPaginateFileTS() }
    : {}),
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

  [`/server.${ext}`]: serverFile,

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
JWT_EXPIRES_IN=1d
LOG_LEVEL=debug
COMMIT_SHA=
SLOW_QUERY_MS=200
${db === "mongo" ? `MONGO_URI="mongodb://localhost:27017/${projectName}"\n` : ""}
${db === "postgres" ? `DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/${projectName}?schema=public"\n` : ""}
`,

  [`src/types/global.types.${ext}`]: `export type ApiResponse<T = unknown> = {
  success: boolean;
  status: number;
  message: string;
  data?: T;
};
`,
};

// write shared files
Object.entries(sharedFiles).forEach(([p, c]) => writeFile(p, c));

/* ---------------------------
   Prisma schema base (postgres)
---------------------------- */
if (db === "postgres") {
  writeFile(
    "prisma/schema.prisma",
    `generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
  runtime               = "nodejs"
  moduleFormat          = "esm"
  generatedFileExtension = "mts"
  importFileExtension    = "mts"
}

datasource db {
  provider = "postgresql"
}

// Models will be appended by the generator below.
`
  );
}

/* ---------------------------
   Module templates
---------------------------- */
function moduleTemplates(rawName: string) {
  const name = toKebab(rawName);
  const camel = toCamel(rawName);
  const pascal = toPascal(rawName);
  const plural = pluralize(name);
  const prismaDelegate = pascal.charAt(0).toLowerCase() + pascal.slice(1);

  const moduleBasePath = `src/modules/${name}`;

  // schema
  let schema = "";

  if (db === "mongo") {
    const userFields =
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
${userFields}    // add fields
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

export const ${pascal}Validation = {
  getAll${pascal}sValidation: { query: getAll${pascal}sSchema },
  get${pascal}ByIdValidation: { params: get${pascal}ByIdSchema },
  createValidation: { body: create${pascal}Schema },
  update${pascal}ByIdValidation: { query: get${pascal}ByIdSchema, body: update${pascal}Schema },
  deleteValidation: { body: get${pascal}ByIdSchema },
};
`;

  const typesFile = `// ${pascal} Entity
export interface ${pascal}Entity {
  id: string;
  // add fields here
};

export const mapToEntity = (doc: any): ${pascal}Entity => ({
  // supports mongo (_id) + postgres (id)
  id: doc?._id ? doc._id.toString() : String(doc?.id ?? ""),
  // map fields here
});

// DTOs (Data-Transfer-Objects)
export interface GetAll${pascal}sDTO {
  page: number;
  limit: number;
};

export interface Get${pascal}DTO {
  id: string;
};

export interface Create${pascal}DTO {
  ${name === "user" ? `name: string;
  email: string;` : `// add fields here`}
};

export interface Update${pascal}DTO {
  id: string;
  ${name === "user" ? `name?: string;
  email?: string;` : `// add optional fields here`}
};

export interface Delete${pascal}DTO {
  id: string;
};

export interface ${pascal}ExistDTO {
  ${name === "user" ? `email: string;` : `// add unique fields here`}
}

// method types
export type Find${pascal}ByIdRepo = (data: Get${pascal}DTO) => Promise<${pascal}Entity | null>;
export type ${pascal}ExistRepo = (data: ${pascal}ExistDTO) => Promise<${pascal}Entity | null>;
export type Create${pascal}Repo = (data: Create${pascal}DTO) => Promise<${pascal}Entity>;
export type Update${pascal}Repo = (data: Update${pascal}DTO) => Promise<${pascal}Entity | null>;
export type Delete${pascal}Repo = (data: Delete${pascal}DTO) => Promise<${pascal}Entity | null>;
`;

  let repository = "";

  if (db === "mongo") {
    repository = `import ${pascal}Model from "./${name}.schema.${ext}";
import { mapToEntity, Find${pascal}ByIdRepo, Create${pascal}Repo, ${pascal}Entity, ${pascal}ExistRepo } from "./${name}.types.${ext}";

export const ${camel}Exist: ${pascal}ExistRepo = async (data) => {
  const doc = await ${pascal}Model.findOne(data);
  if (!doc) return null;
  const entity: ${pascal}Entity = mapToEntity(doc);
  return entity;
};

export const create${pascal}Record: Create${pascal}Repo = async (data) => {
  const doc = await ${pascal}Model.create(data);
  const entity: ${pascal}Entity = mapToEntity(doc);
  return entity;
};

export const find${pascal}ById: Find${pascal}ByIdRepo = async (data) => {
  const doc = await ${pascal}Model.findById(data).lean();
  if (!doc) return null;
  const entity: ${pascal}Entity = mapToEntity(doc);
  return entity;
};

export const update${pascal}ById = async (id: string, data: any) => {
  const doc = await ${pascal}Model.findByIdAndUpdate(id, data, { new: true }).lean();
  if (!doc) return null;
  const entity: ${pascal}Entity = mapToEntity(doc);
  return entity;
};

export const delete${pascal}ById = async (id: string) => {
  const doc = await ${pascal}Model.findByIdAndDelete(id).lean();
  const entity: ${pascal}Entity = mapToEntity(doc);
  return entity;
};
`;
  } else if (db === "postgres") {
    repository = `import { prisma } from "../../config/db.${ext}";
import type {
  ${pascal}Entity,
  Find${pascal}ByIdRepo,
  Create${pascal}Repo,
  Update${pascal}Repo,
  Delete${pascal}Repo,
  ${pascal}ExistRepo
} from "./${name}.types.${ext}";
import { mapToEntity } from "./${name}.types.${ext}";

export const ${camel}Exist: ${pascal}ExistRepo = async (data) => {
  const doc = await prisma.${prismaDelegate}.findFirst(data);
  if (!doc) return null;
  const entity: ${pascal}Entity = mapToEntity(doc);
  return entity;
};

export const create${pascal}Record: Create${pascal}Repo = async (data) => {
  const doc = await prisma.${prismaDelegate}.create(data);
  const entity: ${pascal}Entity = mapToEntity(doc);
  return entity;
};

export const find${pascal}ById: Find${pascal}ByIdRepo = async (data) => {
  const doc = await prisma.${prismaDelegate}.findUnique({ where: { id: data.id } });
  if (!doc) return null;
  const entity: ${pascal}Entity = mapToEntity(doc);
  return entity;
};

export const update${pascal}ById: Update${pascal}Repo = async (data) => {
  const { id, ...updatedData } = data;
  const doc = await prisma.${prismaDelegate}.update({
    where: { id },
    data: updatedData
  });

  const entity: ${pascal}Entity = mapToEntity(doc);
  return entity;
};

export const delete${pascal}ById: Delete${pascal}Repo = async (data) => {
  const doc = await prisma.${prismaDelegate}.delete({ where: { id: (data).id } });
  const entity: ${pascal}Entity = mapToEntity(doc);
  return entity;
};
`;
  } else {
    repository = `import type {
  ${pascal}Entity,
  Find${pascal}ByIdRepo,
  Create${pascal}Repo,
  Update${pascal}Repo,
  Delete${pascal}Repo,
  ${pascal}ExistRepo
} from "./${name}.types.${ext}";

export const ${camel}Exist: ${pascal}ExistRepo = async (data) => null;

export const create${pascal}Record: Create${pascal}Repo = async (data) => data;

export const find${pascal}ById: Find${pascal}ByIdRepo = async (data) => null;

export const update${pascal}ById: Update${pascal}Repo = async (data) => null;

export const delete${pascal}ById: Delete${pascal}Repo = async (data) => null;
`;
  }

  // service (calls paginate)
  let service = "";

  if (db === "mongo") {
    service = `import {
  create${pascal}Record,
  find${pascal}ById,
  update${pascal}ById,
  delete${pascal}ById,
  ${camel}Exist
} from "./${name}.repository.${ext}";
import { Create${pascal}DTO, Delete${pascal}DTO, Get${pascal}DTO, Update${pascal}DTO, ${pascal}Entity, mapToEntity } from "./${name}.types.${ext}";
import { logger } from "../../utils/logger.${ext}";
import { getCtx } from "../../utils/context.${ext}";
import errorResponse from "../../utils/errorResponse.${ext}";
import { mongoPaginate } from "../../middlewares/paginationMiddleware.${ext}";
import ${pascal}Model from "./${name}.schema.${ext}";
import { ${pascal}Messages } from "./${name}.messages.${ext}";
import { ApiResponse } from "../../types/global.types.${ext}";

export const create${pascal} = async (data: Create${pascal}DTO): Promise<ApiResponse<${pascal}Entity>> => {
  ${name === "user" ? `const exist = await ${camel}Exist({email: data.email});
  if(exist){
    logger.warn({ event: "${name}_service_error", svc: "${name}", action: "${name}_already_exist", reason: ${pascal}Messages.ALREADY_EXIST, ...getCtx() });
    throw new errorResponse(${pascal}Messages.ALREADY_EXIST, 400);
  };` : ``}

  const ${camel} = await create${pascal}Record(data);
  if(!${camel}){
    logger.warn({ event: "${name}_service_error", svc: "${name}", action: "create_${name}", reason: ${pascal}Messages.CREATE_FAILED, ...getCtx() });
    throw new errorResponse(${pascal}Messages.CREATE_FAILED, 400);
  }
  return { success: true, status: 200, message: ${pascal}Messages.CREATE_SUCCESS, data: ${camel} };
};

export const list${pascal} = async (filter: Record<string, string> = {}, options: Record<string, unknown> = {}) => {
  const data = await mongoPaginate(${pascal}Model, filter, options);
  return { success: true, status: 200, message: ${pascal}Messages.LIST_SUCCESS, data: data };
};

export const get${pascal} = async (id: Get${pascal}DTO): Promise<ApiResponse<${pascal}Entity>> => {
  const ${name} = await find${pascal}ById(id);
  if (!${name}) {
    logger.warn({ event: "${name}_service_error", svc: "${name}", action: "get_${name}", reason: "${pascal.toUpperCase()}_NOT_FOUND", ...getCtx() });
    throw new errorResponse(${pascal}Messages.NOT_FOUND, 404);
  }

  return { success: true, status: 200, message: ${pascal}Messages.GET_SUCCESS, data: ${name} };
};

export const update${pascal} = async (data: Update${pascal}DTO): Promise<ApiResponse<${pascal}Entity>> => {
  const updated = await update${pascal}ById(data.id, data);
  if (!updated) {
    logger.warn({ event: "${name}_service_error", svc: "${name}", action: "update_${name}", reason: "${pascal.toUpperCase()}_NOT_FOUND", ...getCtx() });
    throw new errorResponse(${pascal}Messages.NOT_FOUND, 404);
  }
  return { success: true, status: 200, message: ${pascal}Messages.UPDATE_SUCCESS, data: updated };
};

export const delete${pascal} = async (data: Delete${pascal}DTO): Promise<ApiResponse<${pascal}Entity>>=> {
  const ${name} = await delete${pascal}ById(data.id);
  if (!${name}) {
    logger.warn({ event: "${name}_service_error", svc: "${name}", action: "delete_${name}", reason: "${pascal.toUpperCase()}_NOT_FOUND", ...getCtx() });
    throw new errorResponse(${pascal}Messages.NOT_FOUND, 404);
  }
  return { success: true, status: 200, message: ${pascal}Messages.DELETE_SUCCESS };
}; 
`;
  } else if (db === "postgres") {
    service = `import { logger } from "../../utils/logger.${ext}";
import { getCtx } from "../../utils/context.${ext}";
import errorResponse from "../../utils/errorResponse.${ext}";
import { prismaPaginate } from "../../middlewares/paginationMiddleware.${ext}";
import { prisma } from "../../config/db.${ext}";
import { ${pascal}Messages } from "./${name}.messages.${ext}";
import type { ApiResponse } from "../../types/global.types.${ext}";
import type { Create${pascal}DTO, Delete${pascal}DTO, Get${pascal}DTO, Update${pascal}DTO, ${pascal}Entity } from "./${name}.types.${ext}";
import {
  create${pascal}Record,
  find${pascal}ById,
  update${pascal}ById,
  delete${pascal}ById,
  ${camel}Exist
} from "./${name}.repository.${ext}";

export const create${pascal} = async (data: Create${pascal}DTO): Promise<ApiResponse<${pascal}Entity>> => {
  ${name === "user" ? `const exist = await ${camel}Exist({ email: (data).email });
  if (exist) {
    logger.warn({ event: "${name}_service_error", svc: "${name}", action: "${name}_already_exist", reason: ${pascal}Messages.ALREADY_EXIST, ...getCtx() });
    throw new errorResponse(${pascal}Messages.ALREADY_EXIST, 400);
  }` : ``}

  const record = await create${pascal}Record(data);
  if (!record) {
    logger.warn({ event: "${name}_service_error", svc: "${name}", action: "create_${name}", reason: ${pascal}Messages.CREATE_FAILED, ...getCtx() });
    throw new errorResponse(${pascal}Messages.CREATE_FAILED, 400);
  }

  return { success: true, status: 200, message: ${pascal}Messages.CREATE_SUCCESS, data: record };
};

export const list${pascal} = async (filter: Record<string, string> = {}, options: Record<string, unknown> = {}) => {
  const data = await prismaPaginate(prisma.${prismaDelegate}, filter, options);
  return { success: true, status: 200, message: ${pascal}Messages.LIST_SUCCESS, data: data };
};

export const get${pascal} = async (data: Get${pascal}DTO): Promise<ApiResponse<${pascal}Entity>> => {
  const ${name} = await find${pascal}ById(data);
  if (!${name}) {
    logger.warn({ event: "${name}_service_error", svc: "${name}", action: "get_${name}", reason: "${pascal.toUpperCase()}_NOT_FOUND", ...getCtx() });
    throw new errorResponse(${pascal}Messages.NOT_FOUND, 404);
  }

  return { success: true, status: 200, message: ${pascal}Messages.GET_SUCCESS, data: ${name} };
};

export const update${pascal} = async (data: Update${pascal}DTO): Promise<ApiResponse<${pascal}Entity>> => {
  const updated = await update${pascal}ById(data);
  if (!updated) {
    logger.warn({ event: "${name}_service_error", svc: "${name}", action: "update_${name}", reason: "${pascal.toUpperCase()}_NOT_FOUND", ...getCtx() });
    throw new errorResponse(${pascal}Messages.NOT_FOUND, 404);
  }

  return { success: true, status: 200, message: ${pascal}Messages.UPDATE_SUCCESS, data: updated };
};

export const delete${pascal} = async (data: Delete${pascal}DTO): Promise<ApiResponse<${pascal}Entity>> => {
  const ${name} = await delete${pascal}ById(data);
  if (!${name}) {
    logger.warn({ event: "${name}_service_error", svc: "${name}", action: "delete_${name}", reason: "${pascal.toUpperCase()}_NOT_FOUND", ...getCtx() });
    throw new errorResponse(${pascal}Messages.NOT_FOUND, 404);
  }

  return { success: true, status: 200, message: ${pascal}Messages.DELETE_SUCCESS };
};
`;
  } else {
    service = `import { ${pascal}Messages } from "./${name}.messages.${ext}";
import type { ApiResponse } from "../../types/global.types.${ext}";
import type { Create${pascal}DTO, Delete${pascal}DTO, Get${pascal}DTO, Update${pascal}DTO, ${pascal}Entity } from "./${name}.types.${ext}";

export const create${pascal} = async (data: Create${pascal}DTO): Promise<ApiResponse<${pascal}Entity>> =>
  ({ success: true, status: 200, message: ${pascal}Messages.CREATE_SUCCESS, data: data });

export const list${pascal} = async (filter: any = {}, options: any = {}) => {
  void filter; void options;
  return ({ success: true, status: 200, message: ${pascal}Messages.LIST_SUCCESS, data: [] });
};

export const get${pascal} = async (data: Get${pascal}DTO): Promise<ApiResponse<${pascal}Entity>> => {
  void data;
  return ({ success: true, status: 200, message: ${pascal}Messages.GET_SUCCESS});
};

export const update${pascal} = async (data: Update${pascal}DTO): Promise<ApiResponse<${pascal}Entity>> =>
  ({ success: true, status: 200, message: ${pascal}Messages.UPDATE_SUCCESS, data: data });

export const delete${pascal} = async (data: Delete${pascal}DTO): Promise<ApiResponse<any>> => {
  void data;
  return ({ success: true, status: 200, message: ${pascal}Messages.DELETE_SUCCESS, data: true });
};
`;
  }

  // controller (matches your routes behavior)
  const controller = `import { create${pascal}, list${pascal}, get${pascal}, update${pascal}, delete${pascal} } from "./${name}.service.${ext}";
import { Create${pascal}DTO, Delete${pascal}DTO, Get${pascal}DTO, Update${pascal}DTO } from "./${name}.types.${ext}";
import { Request, Response } from "express"; 
import { asyncHandler } from "../../utils/asyncHandler.${ext}";
import { sendSuccess } from "../../utils/globalResponse.${ext}";

export const create${pascal}Handler = asyncHandler(async (req: Request, res: Response) => {
  const data: Create${pascal}DTO = req.body;
  const record = await create${pascal}(data);
  return sendSuccess(res, record.status, record.message, record.data);
}, { ctrl: "${name}", action: "create_${name}" });

export interface ListQuery {
  page?: number;
  limit?: number;
}

export const list${pascal}Handler = asyncHandler(async (req: Request<{}, {}, {}, ListQuery>, res: Response) => {
  const { page, limit } = req.query;
  const filter = {};
  const options = { page, limit };
  const record = await list${pascal}(filter, options);
  return sendSuccess(res, record.status, record.message, record.data);
}, { ctrl: "${name}", action: "list_${name}" });

export const get${pascal}Handler = asyncHandler(async (req: Request<Get${pascal}DTO>, res: Response) => {
  const data = req.params;
  const record = await get${pascal}({ id: data.id });
  return sendSuccess(res, record.status, record.message, record.data);
}, { ctrl: "${name}", action: "get_${name}" });

export const update${pascal}Handler = asyncHandler(async (req: Request, res: Response) => {
  const data: Update${pascal}DTO = req.body;
  const record = await update${pascal}(data);
  return sendSuccess(res, record.status, record.message, record.data);
}, { ctrl: "${name}", action: "update_${name}" });

export const delete${pascal}Handler = asyncHandler(async (req: Request, res: Response) => {
  const data: Delete${pascal}DTO = req.body;
  const record = await delete${pascal}(data);
  return sendSuccess(res, record.status, record.message, record.data);
}, { ctrl: "${name}", action: "delete_${name}" });
`;

  // routes (exactly like yours)
  const routes = `import { Router } from "express";
import { validate } from "../../middlewares/validate.${ext}";
import { ${pascal}Validation } from "./${name}.validation.${ext}";
import {
  create${pascal}Handler,
  list${pascal}Handler,
  get${pascal}Handler,
  update${pascal}Handler,
  delete${pascal}Handler
} from "./${name}.controller.${ext}";

const router = Router();

router.get("/", validate(${pascal}Validation.getAll${pascal}sValidation), list${pascal}Handler);
router.post("/", validate(${pascal}Validation.createValidation), create${pascal}Handler);

router.get("/:id", validate(${pascal}Validation.get${pascal}ByIdValidation), get${pascal}Handler);
router.patch("/", validate(${pascal}Validation.update${pascal}ByIdValidation), update${pascal}Handler);
router.delete("/", validate(${pascal}Validation.deleteValidation), delete${pascal}Handler);

export default router;
`;

  const files: Record<string, string> = {
    [`${moduleBasePath}/${name}.schema.${ext}`]: schema,
    [`${moduleBasePath}/${name}.messages.${ext}`]: messagesFile,
    [`${moduleBasePath}/${name}.validation.${ext}`]: validationFile,
    [`${moduleBasePath}/${name}.types.${ext}`]: typesFile,
    [`${moduleBasePath}/${name}.repository.${ext}`]: repository,
    [`${moduleBasePath}/${name}.service.${ext}`]: service,
    [`${moduleBasePath}/${name}.controller.${ext}`]: controller,
    [`${moduleBasePath}/${name}.routes.${ext}`]: routes,
  };

  return {
    module: { name, camel, pascal, plural, prismaDelegate },
    files,
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
   package.json
---------------------------- */
const pkgJsonPath = path.join(base, "package.json");
if (!fs.existsSync(pkgJsonPath)) {
  const deps: Record<string, string> = {
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
  if (db === "postgres") {
    deps["@prisma/client"] = "latest";
    deps["@prisma/adapter-pg"] = "latest";
    deps.pg = "latest";
  }

  const scripts: Record<string, string> = {
    dev: "tsx watch src/server.mts",
    build: "tsc -p tsconfig.json",
    start: "node dist/server.mjs",
  };

  const devDependencies: Record<string, string> = {
    tsx: "latest",
    typescript: "latest",
    "@types/node": "latest",
    "@types/express": "latest",
    "@types/jsonwebtoken": "latest",
    "@types/multer": "latest",
    "@types/mime-types": "latest",
  };

  if (db === "postgres") {
    scripts["prisma:generate"] = "prisma generate";
    scripts["prisma:migrate"] = "prisma migrate dev";
    scripts.postinstall = "prisma generate";
    devDependencies.prisma = "latest";
    devDependencies["@types/pg"] = "latest";
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

/* ---------------------------
   Post notes
---------------------------- */
console.log(`✅ Backend (.mts) created successfully 🚀`);
console.log(`DB mode: ${db}`);
if (modules.length) console.log(`Modules scaffolded: ${modules.join(", ")}`);
console.log(`Next: cd ${projectName} && npm i && npm run dev`);

if (db === "postgres") {
  console.log("Postgres mode notes:");
  console.log("- Update DATABASE_URL in .env");
  console.log("- Run: npx prisma migrate dev --name init");
}
if (db === "mongo") {
  console.log("Mongo mode notes:");
  console.log("- Update MONGO_URI in .env");
}