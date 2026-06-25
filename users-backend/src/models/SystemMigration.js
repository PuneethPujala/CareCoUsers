const mongoose = require("mongoose");

const SystemMigrationSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    executed_at: {
      type: Date,
      default: Date.now,
    },
    version: {
      type: String,
      default: "1.0.0",
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("SystemMigration", SystemMigrationSchema);
