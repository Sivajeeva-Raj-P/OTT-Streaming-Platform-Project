const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const Admin = require("../models/Admin");
const User = require("../models/User");
const Movie = require("../models/Movie");
const { requireAdminPage } = require("../middleware/auth");

const router = express.Router();

const signToken = (payload) => {
  const secret = process.env.JWT_SECRET || "ott-secret";
  return jwt.sign(payload, secret, { expiresIn: "7d" });
};

const ensureDefaultAdmin = async () => {
  const email = process.env.DEFAULT_ADMIN_EMAIL || "admin@ott.com";
  const password = process.env.DEFAULT_ADMIN_PASSWORD || "Admin@123";
  const existing = await Admin.findOne({ email });
  if (!existing) {
    const hash = await bcrypt.hash(password, 10);
    await Admin.create({ email, password: hash });
  }
};

router.get("/admin/login", async (req, res) => {
  await ensureDefaultAdmin();
  res.render("admin-login", { title: "Admin Login", error: null });
});

router.post("/admin/login", async (req, res) => {
  const { email, password } = req.body;
  const admin = await Admin.findOne({ email: (email || "").toLowerCase() });
  if (!admin) return res.render("admin-login", { title: "Admin Login", error: "Invalid credentials" });

  const valid = await bcrypt.compare(password || "", admin.password);
  if (!valid) return res.render("admin-login", { title: "Admin Login", error: "Invalid credentials" });

  const token = signToken({ id: admin._id, role: "admin", email: admin.email });
  res.cookie("adminToken", token, { httpOnly: true, sameSite: "lax" });
  return res.redirect("/admin/dashboard");
});

router.get("/admin/logout", (req, res) => {
  res.clearCookie("adminToken");
  res.redirect("/admin/login");
});

router.get("/admin/dashboard", requireAdminPage, async (req, res) => {
  const [movieCount, userCount] = await Promise.all([Movie.countDocuments(), User.countDocuments()]);
  const topMovies = await Movie.find().sort({ viewCount: -1 }).limit(5);
  res.render("admin-dashboard", {
    title: "Dashboard",
    adminEmail: req.admin.email || "admin@ott.com",
    movieCount,
    userCount,
    topMovies,
  });
});

router.get("/admin/movies", requireAdminPage, async (req, res) => {
  const movies = await Movie.find().sort({ createdAt: -1 });
  res.render("admin-movies", { title: "Manage Movies", movies, editMovie: null });
});

router.post("/admin/movies", requireAdminPage, async (req, res) => {
  const { title, description, thumbnailUrl, videoUrl } = req.body;
  await Movie.create({ title, description, thumbnailUrl, videoUrl });
  res.redirect("/admin/movies");
});

router.get("/admin/movies/edit/:id", requireAdminPage, async (req, res) => {
  const movies = await Movie.find().sort({ createdAt: -1 });
  const editMovie = await Movie.findById(req.params.id);
  res.render("admin-movies", { title: "Manage Movies", movies, editMovie });
});

router.post("/admin/movies/edit/:id", requireAdminPage, async (req, res) => {
  const { title, description, thumbnailUrl, videoUrl } = req.body;
  await Movie.findByIdAndUpdate(req.params.id, { title, description, thumbnailUrl, videoUrl });
  res.redirect("/admin/movies");
});

router.post("/admin/movies/delete/:id", requireAdminPage, async (req, res) => {
  await Movie.findByIdAndDelete(req.params.id);
  res.redirect("/admin/movies");
});

router.get("/admin/users", requireAdminPage, async (req, res) => {
  const search = req.query.search || "";
  const users = await User.find({
    $or: [
      { name: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
    ],
  }).sort({ createdAt: -1 });
  res.render("admin-users", { title: "Manage Users", users, search });
});

router.post("/admin/users/:id/toggle-block", requireAdminPage, async (req, res) => {
  const user = await User.findById(req.params.id);
  if (user) {
    user.isBlocked = !user.isBlocked;
    await user.save();
  }
  res.redirect("/admin/users");
});

router.get("/admin/users/:id/history", requireAdminPage, async (req, res) => {
  const user = await User.findById(req.params.id).populate("viewHistory.movie");
  const history = (user?.viewHistory || [])
    .slice()
    .sort((a, b) => new Date(b.viewedAt) - new Date(a.viewedAt));
  res.render("admin-user-history", { title: "User History", user, history });
});

router.get("/admin/reports", requireAdminPage, async (req, res) => {
  const movies = await Movie.find().sort({ viewCount: -1, title: 1 });
  res.render("admin-reports", { title: "View Reports", movies });
});

router.get("/admin/change-password", requireAdminPage, (req, res) => {
  res.render("admin-change-password", { title: "Change Password", error: null, success: null });
});

router.post("/admin/change-password", requireAdminPage, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const admin = await Admin.findById(req.admin.id);
  if (!admin) {
    return res.render("admin-change-password", {
      title: "Change Password",
      error: "Admin not found",
      success: null,
    });
  }

  const valid = await bcrypt.compare(currentPassword || "", admin.password);
  if (!valid) {
    return res.render("admin-change-password", {
      title: "Change Password",
      error: "Current password is incorrect",
      success: null,
    });
  }

  admin.password = await bcrypt.hash(newPassword || "", 10);
  await admin.save();

  return res.render("admin-change-password", {
    title: "Change Password",
    error: null,
    success: "Password updated successfully",
  });
});

module.exports = router;
