const jwt = require("jsonwebtoken");

const getTokenFromHeader = (req) => {
  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("Bearer ")) return null;
  return authHeader.split(" ")[1];
};

const verifyToken = (token) => {
  const secret = process.env.JWT_SECRET || "ott-secret";
  return jwt.verify(token, secret);
};

const requireUser = (req, res, next) => {
  try {
    const token = getTokenFromHeader(req);
    if (!token) return res.status(401).json({ message: "Unauthorized" });

    const decoded = verifyToken(token);
    if (decoded.role !== "user") {
      return res.status(403).json({ message: "Forbidden" });
    }

    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid token" });
  }
};

const requireAdminApi = (req, res, next) => {
  try {
    const token = getTokenFromHeader(req);
    if (!token) return res.status(401).json({ message: "Unauthorized" });

    const decoded = verifyToken(token);
    if (decoded.role !== "admin") {
      return res.status(403).json({ message: "Forbidden" });
    }

    req.admin = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid token" });
  }
};

const requireAdminPage = (req, res, next) => {
  try {
    const token = req.cookies.adminToken;
    if (!token) return res.redirect("/admin/login");

    const decoded = verifyToken(token);
    if (decoded.role !== "admin") return res.redirect("/admin/login");

    req.admin = decoded;
    next();
  } catch (error) {
    return res.redirect("/admin/login");
  }
};

module.exports = {
  requireUser,
  requireAdminApi,
  requireAdminPage,
};
