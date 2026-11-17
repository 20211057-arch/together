const mongoose = require('mongoose');
const schema = new mongoose.Schema({
    crew: { type: mongoose.Schema.Types.ObjectId, ref: 'regularCrew', required: true, index: true },
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    src: { type: String, required: true },
    caption: { type: String, maxlength: 300, default: '' }
}, { timestamps: true });
schema.index({ crew: 1, createdAt: -1 });
module.exports = mongoose.model('CrewPhoto', schema);
