import winston from "winston";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const { combine, timestamp, printf, colorize, errors } = winston.format;

const logFormat = printf(({ level, message, timestamp, stack }) => {
  return `${timestamp} [${level}]: ${stack || message}`;
});

const logger = winston.createLogger({
  level: process.env.NODE_ENV === "production" ? "info" : "debug",
  format: combine(
    timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    errors({ stack: true }),
    logFormat
  ),
  transports: [
    new winston.transports.Console({
      format: combine(colorize(), timestamp({ format: "HH:mm:ss" }), logFormat),
    }),
    new winston.transports.File({
      filename: path.join(__dirname, "../../logs/error.log"),
      level: "error",
      maxsize: 5 * 1024 * 1024,
      maxFiles: 3,
    }),
    new winston.transports.File({
      filename: path.join(__dirname, "../../logs/combined.log"),
      maxsize: 10 * 1024 * 1024,
      maxFiles: 5,
    }),
  ],
});

export default logger;
