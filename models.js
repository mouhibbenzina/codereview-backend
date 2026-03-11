const mongoose = require('mongoose');

// User Model
const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['student', 'teacher'], default: 'student' },
  avatar: String,
  createdAt: { type: Date, default: Date.now }
});

// Classroom Model
const ClassRoomSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: String,
  inviteCode: { type: String, unique: true },
  teacher: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  students: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  createdAt: { type: Date, default: Date.now }
});

// Auto-generate invite code
ClassRoomSchema.pre('save', function(next) {
  if (!this.inviteCode) {
    this.inviteCode = Math.random().toString(36).substring(2, 10).toUpperCase();
  }
  next();
});

// Assignment Model
const AssignmentSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, required: true },
  language: { type: String, required: true },
  deadline: Date,
  maxGrade: { type: Number, default: 100 },
  classRoom: { type: mongoose.Schema.Types.ObjectId, ref: 'ClassRoom', required: true },
  createdAt: { type: Date, default: Date.now }
});

// Submission Model
const SubmissionSchema = new mongoose.Schema({
  code: { type: String, required: true },
  status: { type: String, enum: ['pending', 'reviewed', 'graded'], default: 'pending' },
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  assignment: { type: mongoose.Schema.Types.ObjectId, ref: 'Assignment', required: true },
  aiReview: {
    summary: String,
    score: Number,
    complexity: String,
    bugs: [{ line: Number, description: String, severity: String }],
    improvements: [{ description: String }],
    bestPractices: [{ description: String }],
    positives: [{ description: String }]
  },
  grade: {
    score: Number,
    feedback: String,
    gradedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    gradedAt: Date
  },
  submittedAt: { type: Date, default: Date.now }
});

// Comment Model
const CommentSchema = new mongoose.Schema({
  submission: { type: mongoose.Schema.Types.ObjectId, ref: 'Submission', required: true },
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  authorName: String,
  lineNumber: Number,
  text: { type: String, required: true },
  type: { type: String, enum: ['bug', 'suggestion', 'praise', 'question'], default: 'suggestion' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = {
  User: mongoose.model('User', UserSchema),
  ClassRoom: mongoose.model('ClassRoom', ClassRoomSchema),
  Assignment: mongoose.model('Assignment', AssignmentSchema),
  Submission: mongoose.model('Submission', SubmissionSchema),
  Comment: mongoose.model('Comment', CommentSchema)
};
