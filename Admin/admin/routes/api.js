const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const Admin = require("../models/Admin");
const User = require("../models/User");
const Movie = require("../models/Movie");
const { requireUser, requireAdminApi } = require("../middleware/auth");

const router = express.Router();

const signToken = (payload) => {
  const secret = process.env.JWT_SECRET || "ott-secret";
  return jwt.sign(payload, secret, { expiresIn: "7d" });
};

// Ensure a default admin user exists
const ensureDefaultAdmin = async () => {
  const email = process.env.DEFAULT_ADMIN_EMAIL || "admin@ott.com";
  const password = process.env.DEFAULT_ADMIN_PASSWORD || "Admin@123";
  const existing = await Admin.findOne({ email });
  if (!existing) {
    const hash = await bcrypt.hash(password, 10);
    await Admin.create({ email, password: hash });
    console.log(`Default admin created: ${email}`);
  }
};

router.get("/health", async (req, res) => {
  await ensureDefaultAdmin();
  res.json({ message: "API is running" });
});

// User auth
router.post("/auth/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ message: "Name, email and password are required" });
    }

    const exists = await User.findOne({ email: email.toLowerCase() });
    if (exists) return res.status(409).json({ message: "Email already registered" });

    const hash = await bcrypt.hash(password, 10);
    const user = await User.create({
      name,
      email: email.toLowerCase(),
      password: hash,
    });

    const token = signToken({ id: user._id, role: "user" });
    res.status(201).json({
      message: "Registration successful",
      token,
      user: { id: user._id, name: user.name, email: user.email },
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to register user" });
  }
});

router.post("/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email: (email || "").toLowerCase() });
    if (!user) return res.status(401).json({ message: "Invalid credentials" });
    if (user.isBlocked) return res.status(403).json({ message: "User account is blocked" });

    const valid = await bcrypt.compare(password || "", user.password);
    if (!valid) return res.status(401).json({ message: "Invalid credentials" });

    const token = signToken({ id: user._id, role: "user" });
    res.json({
      message: "Login successful",
      token,
      user: { id: user._id, name: user.name, email: user.email },
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to login" });
  }
});

router.post("/auth/change-password", requireUser, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    const valid = await bcrypt.compare(currentPassword || "", user.password);
    if (!valid) return res.status(401).json({ message: "Current password is incorrect" });

    user.password = await bcrypt.hash(newPassword || "", 10);
    await user.save();
    res.json({ message: "Password updated successfully" });
  } catch (error) {
    res.status(500).json({ message: "Failed to change password" });
  }
});

// User movie browsing
router.get("/movies", requireUser, async (req, res) => {
  const movies = await Movie.find().sort({ createdAt: -1 });
  res.json(movies);
});

router.get("/movies/:id", requireUser, async (req, res) => {
  try {
    const movie = await Movie.findById(req.params.id);
    if (!movie) return res.status(404).json({ message: "Movie not found" });

    movie.viewCount += 1;
    await movie.save();

    await User.findByIdAndUpdate(req.user.id, {
      $push: { viewHistory: { movie: movie._id, viewedAt: new Date() } },
    });

    res.json(movie);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch movie details" });
  }
});

router.get("/user/watchlist", requireUser, async (req, res) => {
  const user = await User.findById(req.user.id).populate("watchlist");
  res.json(user ? user.watchlist : []);
});

router.post("/user/watchlist/:movieId", requireUser, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    const exists = user.watchlist.some((id) => id.toString() === req.params.movieId);
    if (!exists) {
      user.watchlist.push(req.params.movieId);
      await user.save();
    }
    res.json({ message: "Added to watchlist" });
  } catch (error) {
    res.status(500).json({ message: "Failed to update watchlist" });
  }
});

router.delete("/user/watchlist/:movieId", requireUser, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user.id, {
      $pull: { watchlist: req.params.movieId },
    });
    res.json({ message: "Removed from watchlist" });
  } catch (error) {
    res.status(500).json({ message: "Failed to update watchlist" });
  }
});

router.get("/user/history", requireUser, async (req, res) => {
  const user = await User.findById(req.user.id).populate("viewHistory.movie");
  const history = (user?.viewHistory || [])
    .slice()
    .sort((a, b) => new Date(b.viewedAt) - new Date(a.viewedAt));
  res.json(history);
});

// Admin auth
router.post("/admin/login", async (req, res) => {
  try {
    await ensureDefaultAdmin();
    const { email, password } = req.body;
    const admin = await Admin.findOne({ email: (email || "").toLowerCase() });
    if (!admin) return res.status(401).json({ message: "Invalid credentials" });

    const valid = await bcrypt.compare(password || "", admin.password);
    if (!valid) return res.status(401).json({ message: "Invalid credentials" });

    const token = signToken({ id: admin._id, role: "admin" });
    res.json({
      message: "Admin login successful",
      token,
      admin: { id: admin._id, email: admin.email },
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to login as admin" });
  }
});

router.post("/admin/change-password", requireAdminApi, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const admin = await Admin.findById(req.admin.id);
    if (!admin) return res.status(404).json({ message: "Admin not found" });

    const valid = await bcrypt.compare(currentPassword || "", admin.password);
    if (!valid) return res.status(401).json({ message: "Current password is incorrect" });

    admin.password = await bcrypt.hash(newPassword || "", 10);
    await admin.save();
    res.json({ message: "Admin password updated successfully" });
  } catch (error) {
    res.status(500).json({ message: "Failed to update password" });
  }
});

// Admin movie management
router.get("/admin/movies", requireAdminApi, async (req, res) => {
  const movies = await Movie.find().sort({ createdAt: -1 });
  res.json(movies);
});

router.post("/admin/movies", requireAdminApi, async (req, res) => {
  try {
    const { title, description, thumbnailUrl, videoUrl } = req.body;
    const movie = await Movie.create({ title, description, thumbnailUrl, videoUrl });
    res.status(201).json(movie);
  } catch (error) {
    res.status(500).json({ message: "Failed to create movie" });
  }
});

router.put("/admin/movies/:id", requireAdminApi, async (req, res) => {
  try {
    const { title, description, thumbnailUrl, videoUrl } = req.body;
    const movie = await Movie.findByIdAndUpdate(
      req.params.id,
      { title, description, thumbnailUrl, videoUrl },
      { new: true }
    );
    if (!movie) return res.status(404).json({ message: "Movie not found" });
    res.json(movie);
  } catch (error) {
    res.status(500).json({ message: "Failed to update movie" });
  }
});

router.delete("/admin/movies/:id", requireAdminApi, async (req, res) => {
  try {
    await Movie.findByIdAndDelete(req.params.id);
    res.json({ message: "Movie deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Failed to delete movie" });
  }
});

// Admin user management and reports
router.get("/admin/users", requireAdminApi, async (req, res) => {
  const search = req.query.search || "";
  const users = await User.find({
    $or: [
      { name: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
    ],
  }).sort({ createdAt: -1 });
  res.json(users);
});

router.patch("/admin/users/:id/block", requireAdminApi, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });
    user.isBlocked = !user.isBlocked;
    await user.save();
    res.json({ message: `User ${user.isBlocked ? "blocked" : "unblocked"} successfully` });
  } catch (error) {
    res.status(500).json({ message: "Failed to update user status" });
  }
});

router.get("/admin/users/:id/history", requireAdminApi, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).populate("viewHistory.movie");
    if (!user) return res.status(404).json({ message: "User not found" });
    const history = user.viewHistory
      .slice()
      .sort((a, b) => new Date(b.viewedAt) - new Date(a.viewedAt));
    res.json(history);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch user history" });
  }
});

router.get("/admin/reports/views", requireAdminApi, async (req, res) => {
  const movies = await Movie.find().sort({ viewCount: -1, title: 1 });
  res.json(movies);
});

module.exports = router;
