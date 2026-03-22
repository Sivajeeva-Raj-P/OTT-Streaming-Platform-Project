const mongoose = require("mongoose");

const connectDB = async () => {
  const mongoUri = process.env.MONGO_URI;
  mongoose.set("bufferCommands", false);

  if (!mongoUri) {
    throw new Error("MONGO_URI is missing. Add it in your .env file.");
  }

  await mongoose.connect(mongoUri, {
    serverSelectionTimeoutMS: 5000,
  });
  console.log("MongoDB connected successfully.");
};

module.exports = connectDB;
