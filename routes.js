const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { User, ClassRoom, Assignment, Submission, Comment } = require('./models');
const { auth, teacherOnly, studentOnly } = require('./middleware');
const { reviewCode } = require('./gemini');

const router = express.Router();

// ==================== AUTH ====================

// Register
router.post('/auth/register', async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password || !role)
      return res.status(400).json({ error: 'All fields required' });

    const exists = await User.findOne({ email });
    if (exists) return res.status(409).json({ error: 'Email already exists' });

    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({ name, email, password: hashed, role });

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ token, user: { id: user._id, name, email, role } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Login
router.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user._id, name: user.name, email: user.email, role: user.role } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get current user
router.get('/auth/me', auth, (req, res) => {
  res.json({ id: req.user._id, name: req.user.name, email: req.user.email, role: req.user.role });
});

// ==================== CLASSES ====================

// Teacher: Create class
router.post('/classes', auth, teacherOnly, async (req, res) => {
  try {
    const { name, description } = req.body;
    const classroom = await ClassRoom.create({ name, description, teacher: req.user._id });
    res.status(201).json(classroom);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Teacher: Get my classes
router.get('/classes/mine', auth, teacherOnly, async (req, res) => {
  try {
    const classes = await ClassRoom.find({ teacher: req.user._id });
    const result = await Promise.all(classes.map(async (c) => {
      const assignmentCount = await Assignment.countDocuments({ classRoom: c._id });
      return { ...c.toObject(), studentCount: c.students.length, assignmentCount };
    }));
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Student: Join class by invite code
router.post('/classes/join', auth, studentOnly, async (req, res) => {
  try {
    const { inviteCode } = req.body;
    const classroom = await ClassRoom.findOne({ inviteCode: inviteCode.toUpperCase() });
    if (!classroom) return res.status(404).json({ error: 'Invalid invite code' });

    if (classroom.students.includes(req.user._id))
      return res.status(409).json({ error: 'Already enrolled' });

    classroom.students.push(req.user._id);
    await classroom.save();
    res.json({ message: 'Joined successfully', className: classroom.name });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Student: Get enrolled classes
router.get('/classes/enrolled', auth, studentOnly, async (req, res) => {
  try {
    const classes = await ClassRoom.find({ students: req.user._id }).populate('teacher', 'name');
    res.json(classes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== ASSIGNMENTS ====================

// Teacher: Create assignment
router.post('/classes/:classId/assignments', auth, teacherOnly, async (req, res) => {
  try {
    const { title, description, language, deadline, maxGrade } = req.body;
    const assignment = await Assignment.create({
      title, description, language, deadline, maxGrade,
      classRoom: req.params.classId
    });
    res.status(201).json(assignment);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get assignments for a class
router.get('/classes/:classId/assignments', auth, async (req, res) => {
  try {
    const assignments = await Assignment.find({ classRoom: req.params.classId });
    res.json(assignments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== SUBMISSIONS ====================

// Student: Submit code
router.post('/assignments/:assignmentId/submit', auth, studentOnly, async (req, res) => {
  try {
    const { code } = req.body;
    const assignment = await Assignment.findById(req.params.assignmentId);
    if (!assignment) return res.status(404).json({ error: 'Assignment not found' });

    const submission = await Submission.create({
      code, student: req.user._id, assignment: req.params.assignmentId
    });

    res.status(201).json({ id: submission._id, status: 'pending', message: 'AI review in progress...' });

    // Run AI review async
    setImmediate(async () => {
      try {
        const aiReview = await reviewCode(code, assignment.language);
        submission.aiReview = aiReview;
        submission.status = 'reviewed';
        await submission.save();
        console.log(`✅ AI review done for submission ${submission._id}`);
      } catch (err) {
        console.error('AI review failed:', err.message);
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get submission with AI review
router.get('/submissions/:id', auth, async (req, res) => {
  try {
    const submission = await Submission.findById(req.params.id)
      .populate('student', 'name email')
      .populate('assignment', 'title language');
    if (!submission) return res.status(404).json({ error: 'Not found' });
    res.json(submission);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Teacher: Get all submissions for assignment
router.get('/assignments/:assignmentId/submissions', auth, teacherOnly, async (req, res) => {
  try {
    const submissions = await Submission.find({ assignment: req.params.assignmentId })
      .populate('student', 'name email')
      .select('-code');
    res.json(submissions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Student: Get my submissions
router.get('/my-submissions', auth, studentOnly, async (req, res) => {
  try {
    const submissions = await Submission.find({ student: req.user._id })
      .populate('assignment', 'title language');
    res.json(submissions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Teacher: Grade submission
router.post('/submissions/:id/grade', auth, teacherOnly, async (req, res) => {
  try {
    const { score, feedback } = req.body;
    const submission = await Submission.findByIdAndUpdate(
      req.params.id,
      { grade: { score, feedback, gradedBy: req.user._id, gradedAt: new Date() }, status: 'graded' },
      { new: true }
    );
    res.json(submission);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== COMMENTS ====================

// Post comment
router.post('/submissions/:id/comments', auth, async (req, res) => {
  try {
    const { text, lineNumber, type } = req.body;
    const comment = await Comment.create({
      submission: req.params.id,
      author: req.user._id,
      authorName: req.user.name,
      lineNumber, text, type
    });
    req.app.get('io').to(`sub_${req.params.id}`).emit('new_comment', comment);
    res.status(201).json(comment);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get comments
router.get('/submissions/:id/comments', auth, async (req, res) => {
  try {
    const comments = await Comment.find({ submission: req.params.id }).sort({ createdAt: 1 });
    res.json(comments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Health check
router.get('/health', (req, res) => res.json({ status: 'ok', service: 'codereview-api' }));

module.exports = router;
