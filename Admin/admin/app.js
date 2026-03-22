var createError = require("http-errors");
require("express-async-errors");
var express = require("express");
var path = require("path");
var cookieParser = require("cookie-parser");
var logger = require("morgan");
var cors = require("cors");
var dotenv = require("dotenv");
var mongoose = require("mongoose");

var connectDB = require("./database/db");
var indexRouter = require("./routes/index");
var apiRouter = require("./routes/api");
var adminRouter = require("./routes/user");

dotenv.config();
connectDB().catch((err) => {
  console.error("MongoDB connection failed:", err.message);
});

var app = express();

// view engine setup
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");

app.use(logger("dev"));
app.use(
  cors({
    origin: "http://localhost:3000",
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use((req, res, next) => {
  const protectedPath = req.path.startsWith("/api") || req.path.startsWith("/admin");
  if (!protectedPath) return next();

  if (mongoose.connection.readyState !== 1) {
    if (req.path.startsWith("/api")) {
      return res.status(503).json({
        message: "Database is not connected. Configure MONGO_URI in Admin/admin/.env and restart backend.",
      });
    }

    return res.status(503).render("admin-login", {
      title: "Admin Login",
      error: "Database is not connected. Add valid MONGO_URI in Admin/admin/.env and restart backend.",
    });
  }

  next();
});

app.use("/", indexRouter);
app.use("/", adminRouter);
app.use("/api", apiRouter);

// catch 404 and forward to error handler
app.use(function (req, res, next) {
  next(createError(404));
});

// error handler
app.use(function (err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get("env") === "development" ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render("error");
});

module.exports = app;
