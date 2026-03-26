import jwt from "jsonwebtoken";

const getSecret = () => process.env.JWT_SECRET || "ql_secret_2025";

export const signRoleToken = (payload, expiresIn = "24h") => {
  return jwt.sign(payload, getSecret(), { expiresIn });
};

export const verifyRoleToken = (token) => {
  return jwt.verify(token, getSecret());
};
