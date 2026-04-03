/**
 * generators/create-backend.mts
 *
 * Generates a TypeScript backend scaffold using `.mts` files, ESM, and NodeNext.
 *
 * What this generator creates:
 * - Base Express app structure
 * - Environment config
 * - Request context and logger utilities
 * - Global success/error response helpers
 * - Validation middleware using Zod
 * - Auth middleware scaffold
 * - Upload middleware scaffold
 * - Request/error logging middleware
 * - DB config based on selected mode (`none`, `mongo`, or `postgres`)
 * - Pagination helper file based on selected DB
 * - Optional module scaffolding for the modules passed in `--modules`
 * - Prisma schema setup when `--db postgres` is used
 * 
 * DB modes:
 * - `none`     -> no real DB connection, fallback placeholder repository/service behavior
 * - `mongo`    -> Mongoose config, mongoose slow query plugin, mongo pagination helper
 * - `postgres` -> Prisma config, prisma slow query logger, prisma pagination helper
 *
 * Module scaffolding includes:
 * - schema file
 * - messages file
 * - validation file
 * - types file
 * - repository file
 * - service file
 * - controller file
 * - routes file
 *
 * Route behavior generated for each module:
 * - GET    /         -> list
 * - POST   /         -> create
 * - GET    /:id      -> get by id
 * - PATCH  /         -> update
 * - DELETE /         -> delete
 *
 * Notes about generated behavior:
 * - If `--db` is `mongo` or `postgres`, the `user` module is auto-added if not provided
 * - List controllers use:
 *   - `const filter = {};`
 *   - `const options = { page, limit };`
 * - Services return objects in the format:
 *   - `{ success, status, message, data }`
 * - Controllers send responses through:
 *   - `sendSuccess(res, status, message, data)`
 * - Routes do not use pagination middleware directly
 * - Upload middleware file is always included
 * - Routes use params only for `GET /:id`
 *
 * Current generator behavior:
 * - Generates `.mts` TypeScript backend scaffold files
 * - Supports `--db none | mongo | postgres`
 * - Auto-adds `user` module when DB mode is `mongo` or `postgres`
 * - Generates shared app/config/middleware/utils/types structure
 * - Generates per-module schema, messages, validation, types, repository, service, controller, and routes files
 * - Uses `sendSuccess(res, status, message, data)` in generated controllers
 * - Returns `{ success, status, message, data }` shape from generated services
 * - Uses `const filter = {};` and `const options = { page, limit };` in generated list controllers
 * - Does not attach pagination middleware in generated routes
 * - Generates Mongo pagination helpers for `mongo`
 * - Generates Prisma pagination helpers for `postgres`
 * - Generates mongoose slow query plugin for `mongo`
 * - Generates Prisma slow query logger for `postgres`
 * - Includes `uploadMiddleware.mts`
 * - Generates routes where only `GET /:id` uses params
 * - Generates Prisma schema and package scripts when `--db postgres` is used
 * 
 * Output/runtime notes:
 * - Dev:   `npm run dev`
 * - Build: `npm run build`
 * - Start: `npm start`
 *
 * Examples:
 * - `node .\generators\typeScript-backend.mts my-api --db mongo --modules user,post`
 * - `node .\generators\typeScript-backend-updated.mts my-api --db postgres --modules user,post`
 */

import fs from "node:fs";
import path from "node:path";

/**
 * CLI arguments.
 */
const projectName = process.argv[2];
if (!projectName) {
  console.log(
    "Usage: npx tsx generators/create-backend.mts <projectName> --db mongo|postgres|none --modules user,post"
  );
  process.exit(1);
}

/**
 * Returns the value for a CLI flag.
 *
 * @param flag - The CLI flag to search for.
 * @returns The next argument value if found; otherwise null.
 */
function getArgValue(flag: string) {
  const i = process.argv.indexOf(flag);
  if (i === -1) return null;
  return process.argv[i + 1] ?? null;
}

const modulesArg = getArgValue("--modules");
let modules = modulesArg
  ? [...new Set(
    modulesArg
      .split(",")
      .map((m) => normalizeModuleName(m))
      .filter(Boolean)
  )]
  : [];

const db = (getArgValue("--db") || "none").toLowerCase();
if (!["mongo", "postgres", "none"].includes(db)) {
  console.log("Invalid --db value. Use: mongo | postgres | none");
  process.exit(1);
}

/**
 * If DB is mongo/postgres, auth middleware expects a user module.
 */
if ((db === "mongo" || db === "postgres") && !modules.includes("user")) {
  modules = ["user", ...modules];
}

const ext = "mts";
const base = path.join(process.cwd(), projectName);

/**
 * Ensures a directory exists.
 *
 * @param dirPath - Absolute or relative directory path.
 */
function ensureDir(dirPath: string) {
  fs.mkdirSync(dirPath, { recursive: true });
}

/**
 * Writes a file relative to the generated project root.
 *
 * @param relPath - Relative file path inside the generated project.
 * @param content - File contents.
 */
function writeFile(relPath: string, content: string) {
  const fullPath = path.join(base, relPath);
  ensureDir(path.dirname(fullPath));
  fs.writeFileSync(fullPath, content, "utf8");
}

/**
 * Appends content to a file relative to the generated project root.
 *
 * @param relPath - Relative file path inside the generated project.
 * @param content - Content to append.
 */
function appendFile(relPath: string, content: string) {
  const fullPath = path.join(base, relPath);
  ensureDir(path.dirname(fullPath));
  fs.appendFileSync(fullPath, content, "utf8");
}

/**
 * Converts a string to kebab-case.
 *
 * @param str - Input string.
 * @returns Kebab-cased string.
 */
function toKebab(str: string) {
  return str
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replace(/[\s_]+/g, "-")
    .toLowerCase();
}

/**
 * Normalizes a module name to the canonical scaffold name.
 *
 * @param str - Raw module name.
 * @returns Canonical module name.
 */
function normalizeModuleName(str: string) {
  const normalized = toKebab(str).replace(/^-+|-+$/g, "");

  if (normalized === "users") return "user";

  return normalized;
}

/**
 * Converts a string to camelCase.
 *
 * @param str - Input string.
 * @returns camelCased string.
 */
function toCamel(str: string) {
  const s = str.replace(/[-_\s]+(.)?/g, (_: string, c: string) =>
    c ? c.toUpperCase() : ""
  );
  return s.charAt(0).toLowerCase() + s.slice(1);
}

/**
 * Converts a string to PascalCase.
 *
 * @param str - Input string.
 * @returns PascalCased string.
 */
function toPascal(str: string) {
  const c = toCamel(str);
  return c.charAt(0).toUpperCase() + c.slice(1);
}

/**
 * Returns a simple pluralized version of a module/resource name.
 *
 * @param name - Singular resource name.
 * @returns Pluralized resource name.
 */
function pluralize(name: string) {
  if (name.endsWith("s")) return name;
  if (name.endsWith("y")) return name.slice(0, -1) + "ies";
  return name + "s";
}

/**
 * Base folders created for the scaffold.
 */
[
  "src/config",
  "src/modules",
  "src/middlewares",
  "src/utils",
  "src/types",
  "src/docs",
  "uploads",
].forEach((folder) => ensureDir(path.join(base, folder)));

if (db === "postgres") ensureDir(path.join(base, "prisma"));

/**
 * TypeScript configuration.
 */
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

/**
 * Returns the mongoose slow query plugin source.
 *
 * @returns File content for mongoose slow query logging.
 */
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

/**
 * Returns the Prisma slow query logger source.
 *
 * @returns File content for Prisma slow query logging.
 */
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

/**
 * Returns exact Mongo pagination helper source.
 *
 * @returns File content for mongo pagination helpers.
 */
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

/**
 * Returns Prisma pagination helper source.
 *
 * @returns File content for Prisma pagination helpers.
 */
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

/**
 * Returns upload middleware template source.
 *
 * @returns File content for upload middleware.
 */
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

/**
 * Database config template based on selected DB.
 */
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

/**
 * Server file template.
 */
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

/**
 * Returns auth middleware source based on DB mode.
 *
 * @returns File content for auth middleware.
 */
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

function getMongoErrorMiddlewareBlock() {
  return `
  // Mongo duplicate key
  else if (err?.name === "MongoServerError" && err?.code === 11000) {
    status = 409;
    message = err?.message || "Duplicate value violates unique constraint.";
    data = {
      ...data,
      type: "DatabaseError",
      provider: "mongo",
      name: err?.name,
      code: err?.code,
      reason: "MONGO_11000_ERROR",
      keyValue: err?.keyValue || null,
    };
  }

  // Mongoose validation error
  else if (err?.name === "ValidationError") {
    status = 400;
    message = err?.message || "Database validation failed.";
    data = {
      ...data,
      type: "DatabaseError",
      provider: "mongo",
      name: err?.name,
      reason: "MONGO_VALIDATION_ERROR",
      errors: err?.errors || null,
    };
  }

  // Invalid ObjectId / cast error
  else if (err?.name === "CastError") {
    status = 400;
    message = err?.message || "Invalid database identifier.";
    data = {
      ...data,
      type: "DatabaseError",
      provider: "mongo",
      name: err?.name,
      reason: "MONGO_CAST_ERROR",
      path: err?.path || null,
      value: err?.value || null,
    };
  }

  // Mongo connection / network
  else if (
    err?.name === "MongoNetworkError" ||
    err?.name === "MongooseServerSelectionError"
  ) {
    status = 503;
    message = err?.message || "Database connection failed.";
    data = {
      ...data,
      type: "DatabaseError",
      provider: "mongo",
      name: err?.name,
      reason: "MONGO_CONNECTION_ERROR",
    };
  }`;
}

function getPostgresErrorMiddlewareHelpers() {
  return `
const getPrismaStatusFromCode = (code: string): number => {
  if (/^P2002$/.test(code)) return 409;
  if (/^P2025$/.test(code)) return 404;
  if (/^P2024$/.test(code)) return 503;
  if (/^P2034$/.test(code)) return 409;

  if (/^P1\\\\d{3}$/.test(code)) return 500;
  if (/^P2\\\\d{3}$/.test(code)) return 400;
  if (/^P3\\\\d{3}$/.test(code)) return 500;
  if (/^P4\\\\d{3}$/.test(code)) return 500;

  return 500;
};

const getPrismaReasonFromCode = (code: string): string => {
  return \`PRISMA_\${code}_ERROR\`;
};

const getPrismaFallbackMessage = (code: string): string => {
  if (/^P2002$/.test(code)) return "Duplicate value violates unique constraint.";
  if (/^P2003$/.test(code)) return "Foreign key constraint failed.";
  if (/^P2025$/.test(code)) return "The requested record was not found.";
  if (/^P2024$/.test(code)) return "Database connection pool timed out.";
  if (/^P2034$/.test(code)) return "Transaction failed due to conflict or deadlock.";

  if (/^P1\\\\d{3}$/.test(code)) return "Database initialization or connection error occurred.";
  if (/^P2\\\\d{3}$/.test(code)) return "Database query failed.";
  if (/^P3\\\\d{3}$/.test(code)) return "Database migration or schema engine error occurred.";
  if (/^P4\\\\d{3}$/.test(code)) return "Database engine error occurred.";

  return "Unknown Prisma database error occurred.";
};

const getPostgresStatusFromCode = (code: string): number => {
  if (/^23505$/.test(code)) return 409;
  if (/^23503$/.test(code)) return 400;
  if (/^23502$/.test(code)) return 400;
  if (/^22P02$/.test(code)) return 400;
  if (/^22001$/.test(code)) return 400;
  if (/^40001$/.test(code)) return 409;
  if (/^40P01$/.test(code)) return 409;

  if (/^23/.test(code)) return 400;
  if (/^22/.test(code)) return 400;
  if (/^08/.test(code)) return 503;
  if (/^40/.test(code)) return 409;
  if (/^42/.test(code)) return 500;
  if (/^53/.test(code)) return 503;
  if (/^57/.test(code)) return 503;

  return 500;
};

const getPostgresReasonFromCode = (code: string): string => {
  return \`POSTGRES_\${code}_ERROR\`;
};

const getPostgresFallbackMessage = (code: string): string => {
  if (/^23505$/.test(code)) return "Duplicate value violates database unique constraint.";
  if (/^23503$/.test(code)) return "Foreign key constraint failed.";
  if (/^23502$/.test(code)) return "A required database field cannot be null.";
  if (/^22P02$/.test(code)) return "Invalid input format for a database field.";
  if (/^22001$/.test(code)) return "Provided value is too long for the database field.";
  if (/^40001$/.test(code)) return "Transaction serialization failure occurred. Please retry.";
  if (/^40P01$/.test(code)) return "Transaction failed due to deadlock. Please retry.";

  if (/^23/.test(code)) return "Database integrity constraint violation occurred.";
  if (/^22/.test(code)) return "Invalid database input or data exception occurred.";
  if (/^08/.test(code)) return "Database connection failure occurred.";
  if (/^40/.test(code)) return "Database transaction conflict occurred. Please retry.";
  if (/^42/.test(code)) return "Database schema or query structure error occurred.";
  if (/^53/.test(code)) return "Database resources are currently unavailable.";
  if (/^57/.test(code)) return "Database service is currently unavailable.";

  return "Unknown PostgreSQL database error occurred.";
};`;
}

function getPostgresErrorMiddlewareBlock() {
  return `
  // Prisma errors with code
  else if (typeof err?.code === "string" && /^P\\\\d{4}$/.test(err.code)) {
    status = getPrismaStatusFromCode(err.code);
    message = err?.message || getPrismaFallbackMessage(err.code);
    data = {
      ...data,
      type: "DatabaseError",
      provider: "prisma",
      name: err?.name || "PrismaError",
      code: err.code,
      reason: getPrismaReasonFromCode(err.code),
      meta: err?.meta || null,
      clientVersion: err?.clientVersion || null,
    };
  }

  // Prisma errors without code
  else if (err?.name === "PrismaClientValidationError") {
    status = 400;
    message = err?.message || "Invalid Prisma query input.";
    data = {
      ...data,
      type: "DatabaseError",
      provider: "prisma",
      name: err.name,
      reason: "PRISMA_VALIDATION_ERROR",
      clientVersion: err?.clientVersion || null,
    };
  } else if (err?.name === "PrismaClientInitializationError") {
    status = 500;
    message = err?.message || "Database connection failed.";
    data = {
      ...data,
      type: "DatabaseError",
      provider: "prisma",
      name: err.name,
      reason: "PRISMA_INITIALIZATION_ERROR",
      errorCode: err?.errorCode || null,
      clientVersion: err?.clientVersion || null,
    };
  } else if (err?.name === "PrismaClientRustPanicError") {
    status = 500;
    message = err?.message || "A critical database engine error occurred.";
    data = {
      ...data,
      type: "DatabaseError",
      provider: "prisma",
      name: err.name,
      reason: "PRISMA_ENGINE_PANIC",
      clientVersion: err?.clientVersion || null,
    };
  } else if (err?.name === "PrismaClientUnknownRequestError") {
    status = 500;
    message = err?.message || "An unknown Prisma database error occurred.";
    data = {
      ...data,
      type: "DatabaseError",
      provider: "prisma",
      name: err.name,
      reason: "PRISMA_UNKNOWN_REQUEST_ERROR",
      clientVersion: err?.clientVersion || null,
    };
  }

  // PostgreSQL native errors
  else if (typeof err?.code === "string" && /^[0-9A-Z]{5}$/.test(err.code)) {
    status = getPostgresStatusFromCode(err.code);
    message = err?.message || getPostgresFallbackMessage(err.code);
    data = {
      ...data,
      type: "DatabaseError",
      provider: "postgres",
      name: err?.name || "PostgresError",
      code: err.code,
      reason: getPostgresReasonFromCode(err.code),
      detail: err?.detail || null,
      schema: err?.schema || null,
      table: err?.table || null,
      column: err?.column || null,
      constraint: err?.constraint || null,
      routine: err?.routine || null,
    };
  }`;
}

function getErrorMiddlewareFile() {
  const postgresHelpers = db === "postgres" ? getPostgresErrorMiddlewareHelpers() : "";
  const dbBlock =
    db === "mongo"
      ? getMongoErrorMiddlewareBlock()
      : db === "postgres"
        ? getPostgresErrorMiddlewareBlock()
        : "";

  return `import env from "../config/env.${ext}";
import { logger } from "../utils/logger.${ext}";
import { getCtx } from "../utils/context.${ext}";
import type { Request, Response, NextFunction } from "express";

${postgresHelpers}

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
  }${dbBlock}

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
`;
}

function securityMiddlewareTemplateTS() {
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
  origin: (origin: any, callback: any) => {
    const allowedOrigins: any = "http://localhost:3000";

    // Allow same-origin/no-origin (mobile apps, curl) and dev
    if (!origin || env.NODE_ENV === "development") {
      return callback(null, true);
    }

    const allowed = allowedOrigins.some((allowed: any) => {
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

const customSanitizerMiddleware = (req: any, res: any, next: any) => {
  void res;
  const sanitize = mongoSanitize.sanitize;
  if (req.body) sanitize(req.body);
  if (req.query) sanitize(req.query);
  if (req.params) sanitize(req.params);
  next();
};

const securityMiddleware = (app: any) => {
  // 1. CORS FIRST - Handle preflight requests early
  app.use(cors(corsOptions));

  // Cookie parser - so req.cookies is populated
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

  app.use((req: any, res: any, next: any) => {
    void res;
    const descriptor = Object.getOwnPropertyDescriptor(req, "query");
    Object.defineProperty(req, "query", {
      ...descriptor,
      value: req.query,
      writable: true,
    });
    next();
  });

  // 4. Data Sanitization (After body parsers!)
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

function autoRouterTemplateTS() {
  return `import { Router } from "express";
import type { PathParams } from "express-serve-static-core";
import { zodToJsonSchema } from "zod-to-json-schema";
import { swaggerPaths, swaggerErrorResponses } from "./swagger.registry.${ext}";

const normalizePath = (path: string) => {
  if (!path.startsWith("/")) return \`/\${path}\`;
  return path;
};

const joinPaths = (basePath: string, routePath: string) => {
  const base = normalizePath(basePath).replace(/\\/+$/, "");
  const route = normalizePath(routePath);

  if (route === "/") return base || "/";
  return \`\${base}\${route}\`;
};

const toOpenApiPath = (path: string) => {
  return path.replace(/:([^/]+)/g, "{$1}");
};

const toPathParameters = (path: string) => {
  const matches = [...path.matchAll(/:([^/]+)/g)];
  return matches.map((m) => ({
    name: m[1],
    in: "path",
    required: true,
    schema: { type: "string" },
  }));
};

const toSchema = (schema: any) => {
  if (!schema) return undefined;

  const result: any = zodToJsonSchema(schema, { target: "openApi3" });

  if (result?.$schema) {
    delete result.$schema;
  }

  return result;
};

const toQueryParameters = (schema: any) => {
  const jsonSchema: any = toSchema(schema);

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

export const createAutoRouter = (basePath = "", defaultTag?: string) => {
  const router = Router();
  const methods = ["get", "post", "patch", "delete"] as const;

  methods.forEach((method) => {
    const original = router[method];

    router[method] = function (path: PathParams, ...handlers: any[]) {
      if (typeof path !== "string") {
        return (original as unknown as (...args: any[]) => Router).call(router, path, ...handlers);
      }

      const meta: any = {
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

      const responses: Record<string, any> = {
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

      const autoErrorStatuses = new Set<number>();

      if (meta.body || meta.query || meta.params) {
        autoErrorStatuses.add(400);
      }

      if (meta.auth) {
        autoErrorStatuses.add(401);
      }

      autoErrorStatuses.add(500);

      (meta.errors || []).forEach((status: number) => autoErrorStatuses.add(status));

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

      return (original as unknown as (...args: any[]) => Router).call(router, path, ...handlers);
    };
  });

  return router;
};
`;
}

function swaggerRegistryTemplateTS() {
  return `import { z } from "zod";

export const swaggerPaths: Record<string, any> = {};

export const withSwagger = (handler: any, meta: Record<string, any>) => {
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

export const swaggerErrorResponses: Record<
  number,
  { description: string; schema: any; example: any }
> = {
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
        provider: "prisma",
        code: "P2025",
        reason: "PRISMA_P2025_ERROR",
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
        provider: "prisma",
        code: "P2002",
        reason: "PRISMA_P2002_ERROR",
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
        provider: "prisma",
        code: "P2024",
        reason: "PRISMA_P2024_ERROR",
      },
    },
  },
};
`;
}

/**
 * Shared files written for all generated projects.
 */
const sharedFiles: Record<string, string> = {
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

  [`src/middlewares/securityMiddleware.${ext}`]: securityMiddlewareTemplateTS(),

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

  [`src/middlewares/errorMiddleware.${ext}`]: getErrorMiddlewareFile(),

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

  [`src/docs/auto.router.${ext}`]: autoRouterTemplateTS(),

  [`src/docs/swagger.registry.${ext}`]: swaggerRegistryTemplateTS(),

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
SWAGGER_ENABLED=true
SWAGGER_WRITE_FILE=true
${db === "mongo" ? `MONGO_URI="mongodb://localhost:27017/${projectName}"\n` : ""}
${db === "postgres" ? `DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/${projectName}?schema=public"\n` : ""}
`,

  [`src/types/global.types.${ext}`]: `export type ApiResponse<T = unknown> = {
  success: boolean;
  status: number;
  message: string;
  data?: T | null;
};
`,
};

/**
 * Write shared files.
 */
Object.entries(sharedFiles).forEach(([p, c]) => writeFile(p, c));

/**
 * Prisma schema base for postgres mode.
 */
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

/**
 * Builds all templates for a specific module.
 *
 * @param rawName - Raw module name from CLI input.
 * @returns Module metadata and file map.
 */
function moduleTemplates(rawName: string) {
  const name = normalizeModuleName(rawName);
  const camel = toCamel(name);
  const pascal = toPascal(name);
  const plural = pluralize(name);
  const prismaDelegate = pascal.charAt(0).toLowerCase() + pascal.slice(1);

  const moduleBasePath = `src/modules/${name}`;

  /**
   * Schema template.
   */
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

  const parsedResponseFile = `import { ${pascal}Entity } from "./${name}.types.${ext}";

export const parsed${pascal} = (item: Partial<${pascal}Entity> | any) => {
  return {
    id: item?._id ? String(item._id) : String(item?.id ?? ""),
    // add parsed response fields here
  };
};

export const parsed${pascal}s = (items: Partial<${pascal}Entity>[] | any[] = []) => {
  return items.map((item) => parsed${pascal}(item));
};
`;

  /**
   * Service template that calls paginate helpers.
   */
  let service = "";

  if (db === "mongo") {
    service = `import {
  create${pascal}Record,
  find${pascal}ById,
  update${pascal}ById,
  delete${pascal}ById,
  ${camel}Exist
} from "./${name}.repository.${ext}";
import type { Create${pascal}DTO, Delete${pascal}DTO, Get${pascal}DTO, Update${pascal}DTO, ${pascal}Entity } from "./${name}.types.${ext}";
import { logger } from "../../utils/logger.${ext}";
import { getCtx } from "../../utils/context.${ext}";
import errorResponse from "../../utils/errorResponse.${ext}";
import { mongoPaginate } from "../../middlewares/paginationMiddleware.${ext}";
import ${pascal}Model from "./${name}.schema.${ext}";
import { ${pascal}Messages } from "./${name}.messages.${ext}";
import type { ApiResponse } from "../../types/global.types.${ext}";
import { parsed${pascal}, parsed${pascal}s } from "./${name}.parsedResponse.${ext}";

export const create${pascal} = async (data: Create${pascal}DTO): Promise<ApiResponse<${pascal}Entity>> => {
  ${name === "user" ? `const exist = await ${camel}Exist({ email: data.email });
  if (exist) {
    logger.warn({ event: "${name}_service_error", svc: "${name}", action: "${name}_already_exist", reason: ${pascal}Messages.ALREADY_EXIST, ...getCtx() });
    throw new errorResponse(${pascal}Messages.ALREADY_EXIST, 400);
  }` : ``}

  const record = await create${pascal}Record(data);
  if (!record) {
    logger.warn({ event: "${name}_service_error", svc: "${name}", action: "create_${name}", reason: ${pascal}Messages.CREATE_FAILED, ...getCtx() });
    throw new errorResponse(${pascal}Messages.CREATE_FAILED, 400);
  }

  const parsedData = parsed${pascal}(record);

  return { success: true, status: 200, message: ${pascal}Messages.CREATE_SUCCESS, data: parsedData };
};

export const list${pascal} = async (filter: Record<string, string> = {}, options: Record<string, unknown> = {}) => {
  const ${plural} = await mongoPaginate(${pascal}Model, filter, options);
  const parsed${pascal}Data = parsed${pascal}s(${plural}.data);
  const data = {
    ...${plural},
    data: parsed${pascal}Data
  };

  return { success: true, status: 200, message: ${pascal}Messages.LIST_SUCCESS, data: data };
};

export const get${pascal} = async (data: Get${pascal}DTO): Promise<ApiResponse<${pascal}Entity>> => {
  const ${name} = await find${pascal}ById(data);
  if (!${name}) {
    logger.warn({ event: "${name}_service_error", svc: "${name}", action: "get_${name}", reason: "${pascal.toUpperCase()}_NOT_FOUND", ...getCtx() });
    throw new errorResponse(${pascal}Messages.NOT_FOUND, 404);
  }

  const parsedData = parsed${pascal}(${name});

  return { success: true, status: 200, message: ${pascal}Messages.GET_SUCCESS, data: parsedData };
};

export const update${pascal} = async (data: Update${pascal}DTO): Promise<ApiResponse<${pascal}Entity>> => {
  const updated = await update${pascal}ById(data.id, data);
  if (!updated) {
    logger.warn({ event: "${name}_service_error", svc: "${name}", action: "update_${name}", reason: "${pascal.toUpperCase()}_NOT_FOUND", ...getCtx() });
    throw new errorResponse(${pascal}Messages.NOT_FOUND, 404);
  }

  const parsedData = parsed${pascal}(updated);

  return { success: true, status: 200, message: ${pascal}Messages.UPDATE_SUCCESS, data: parsedData };
};

export const delete${pascal} = async (data: Delete${pascal}DTO): Promise<ApiResponse<${pascal}Entity>> => {
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
import { parsed${pascal}, parsed${pascal}s } from "./${name}.parsedResponse.${ext}";

export const create${pascal} = async (data: Create${pascal}DTO): Promise<ApiResponse<${pascal}Entity>> => {
  ${name === "user" ? `const exist = await ${camel}Exist({ email: data.email });
  if (exist) {
    logger.warn({ event: "${name}_service_error", svc: "${name}", action: "${name}_already_exist", reason: ${pascal}Messages.ALREADY_EXIST, ...getCtx() });
    throw new errorResponse(${pascal}Messages.ALREADY_EXIST, 400);
  }` : ``}

  const record = await create${pascal}Record(data);

  const parsedData = parsed${pascal}(record);

  return { success: true, status: 200, message: ${pascal}Messages.CREATE_SUCCESS, data: parsedData };
};

export const list${pascal} = async (filter: Record<string, string> = {}, options: Record<string, unknown> = {}) => {
  const ${plural} = await prismaPaginate(prisma.${prismaDelegate}, filter, options);
  const parsed${pascal}Data = parsed${pascal}s(${plural}.data);
  const data = {
    ...${plural},
    data: parsed${pascal}Data
  };

  return { success: true, status: 200, message: ${pascal}Messages.LIST_SUCCESS, data: data };
};

export const get${pascal} = async (data: Get${pascal}DTO): Promise<ApiResponse<${pascal}Entity>> => {
  const ${name} = await find${pascal}ById(data);
  if (!${name}) {
    logger.warn({ event: "${name}_service_error", svc: "${name}", action: "get_${name}", reason: "${pascal.toUpperCase()}_NOT_FOUND", ...getCtx() });
    throw new errorResponse(${pascal}Messages.NOT_FOUND, 404);
  }

  const parsedData = parsed${pascal}(${name});

  return { success: true, status: 200, message: ${pascal}Messages.GET_SUCCESS, data: parsedData };
};

export const update${pascal} = async (data: Update${pascal}DTO): Promise<ApiResponse<${pascal}Entity>> => {
  const updated = await update${pascal}ById(data);

  const parsedData = parsed${pascal}(updated);

  return { success: true, status: 200, message: ${pascal}Messages.UPDATE_SUCCESS, data: parsedData };
};

export const delete${pascal} = async (data: Delete${pascal}DTO): Promise<ApiResponse<${pascal}Entity>> => {
  const ${name} = await delete${pascal}ById(data);

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

  /**
   * Controller template matching your routes behavior.
   */
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

  /**
   * Routes template exactly like yours.
   */
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
  delete${pascal}Handler
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

  const files: Record<string, string> = {
    [`${moduleBasePath}/${name}.schema.${ext}`]: schema,
    [`${moduleBasePath}/${name}.messages.${ext}`]: messagesFile,
    [`${moduleBasePath}/${name}.validation.${ext}`]: validationFile,
    [`${moduleBasePath}/${name}.types.${ext}`]: typesFile,
    [`${moduleBasePath}/${name}.parsedResponse.${ext}`]: parsedResponseFile,
    [`${moduleBasePath}/${name}.docs.${ext}`]: docsFile,
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

/**
 * Create modules, mount routes, and append Prisma models.
 */
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

/**
 * package.json generation.
 */
const pkgJsonPath = path.join(base, "package.json");
if (!fs.existsSync(pkgJsonPath)) {
  const deps: Record<string, string> = {
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

  const devDependencies: Record<string, string> = {
    tsx: "^4.7.0",
    typescript: "^5.2.2",
    "@types/node": "^20.0.0",
    "@types/express": "^5.0.6",
    "@types/jsonwebtoken": "^9.0.9",
    "@types/multer": "^2.1.0",
    "@types/mime-types": "^2.1.4",
    "@types/pg": "^8.10.0",
    "@types/cookie-parser": "^1.4.9",
    "@types/swagger-ui-express": "^4.1.8",
  };

  if (db === "mongo") {
    deps.mongoose = "^7.6.0";
  }

  if (db === "postgres") {
    deps["@prisma/client"] = "^6.7.0";
    deps["@prisma/adapter-pg"] = "^6.7.0";
    deps.pg = "^8.11.0";

    devDependencies.prisma = "^6.7.0";
    devDependencies["@types/pg"] = "^8.10.0";
  }

  const scripts: Record<string, string> = {
    dev: "tsx watch src/server.mts",
    build: "tsc -p tsconfig.json",
    start: "node dist/server.mjs",
  };

  if (db === "postgres") {
    scripts["prisma:generate"] = "prisma generate";
    scripts["prisma:migrate"] = "prisma migrate dev";
    scripts.postinstall = "prisma generate";
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

/**
 * Post-generation notes.
 */
console.log(`Backend (.mts) created successfully`);
console.log(`DB mode: ${db}`);
if (modules.length) console.log(`Features created: ${modules.join(", ")}`);

console.log("Next steps:");
console.log(`1. Go to your project folder: cd ${projectName}`);
console.log("2. Install dependencies: npm i");

if (db === "postgres") {
  console.log("3. Open the .env file and set DATABASE_URL to your Postgres connection string.");
  console.log("4. Run your first migration: npx prisma migrate dev --name init");
  console.log("5. Start the app with npm run dev.");
}
if (db === "mongo") {
  console.log("3. Open the .env file and set MONGO_URI to your MongoDB connection string.");
  console.log("4. Start the app with npm run dev.");
}
