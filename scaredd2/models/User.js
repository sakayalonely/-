const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  googleId: { type: String, unique: true, sparse: true },
  displayName: String,
  email: { type: String, unique: true, sparse: true },
  password: String,
  photo: String,
  role: { type: String, default: 'user' }, // <-- добавили роль
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
