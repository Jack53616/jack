import jwt from "jsonwebtoken";

const getSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not configured");
  return secret;
};

export const signRoleToken = (payload, expiresIn = "24h") => {
  return jwt.sign(payload, getSecret(), { expiresIn });
};

export const verifyRoleToken = (token) => {
  return jwt.verify(token, getSecret());
};
