const mongoose = require('mongoose');
const schema = new mongoose.Schema({
    crew: { type: mongoose.Schema.Types.ObjectId, ref: 'regularCrew', required: true, index: true },
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, maxlength: 100 },
    content: { type: String, required: true, maxlength: 10000 }
}, { timestamps: true });
schema.index({ crew: 1, createdAt: -1 });
module.exports = mongoose.model('CrewPost', schema);
