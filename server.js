const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const app = express();
const port = 3053;
const ExcelJS = require('exceljs');

// Middleware
app.use(express.static(__dirname));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
    secret: 'mysecretkey',
    resave: false,
    saveUninitialized: true
}));

// Ensure the uploads directory exists
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

// Connect to MongoDB
mongoose.connect('mongodb://127.0.0.1:27017/student1')
    .then(() => console.log("MongoDB connection successful"))
    .catch(err => console.error("MongoDB connection error:", err));

// User Schema
const userSchema = new mongoose.Schema({
    role: String,
    regd_no: String,
    name: String,
    dob: String,
    gender: String,
    blood_group: String,
    program: String,
    email: String,
    password: String
});

const Users = mongoose.model("Users", userSchema);




const marksSchema = new mongoose.Schema({
    reg_no: {
        type: String,
        required: true,
    },
    semester: Number,
    subject: String,  // Add subject
    internal1: Number,  // Internal marks 1
    internal2: Number,  // Internal marks 2
    consolidatedInternal: Number,  // Calculated average of internal marks
    grade: String,  // Replace semesterMark with grade
    credits: Number  // Add credits for the subject
});

// Creating a compound index on reg_no and marks.subject
marksSchema.index({ reg_no: 1, subject: 1 , semester: 1}, { unique: true });

// Create the Marks model
const Marks = mongoose.model('Marks', marksSchema);


app.post('/add-marks', async (req, res) => {
    try {
        const { reg_no, semester, subject, internal1, internal2, consolidatedInternal, grade, credits } = req.body;

        const newMarks = new Marks({
            reg_no, semester, subject, internal1, internal2, consolidatedInternal, grade, credits
        });

        await newMarks.save();
        res.status(200).json({ message: 'Marks added successfully' }); // Send JSON response on success
    } catch (error) {
        console.error('Error adding marks:', error); // Log the error for debugging
        res.status(500).json({ message: 'Error adding marks', error }); // Send JSON response on error
    }
});

app.get('/view-marks/:reg_no', async (req, res) => {
    const reg_no = req.params.reg_no;

    try {
        const marks = await Marks.find({ reg_no });

        if (!marks) {
            return res.status(404).json({ message: 'Marks not found for this register number' });
        }

        res.status(200).json(marks); // Sending JSON response
    } catch (error) {
        res.status(500).json({ message: 'Error retrieving marks', error });
    }
});


// Certificate Schema
const certificateSchema = new mongoose.Schema({
    studentId: String, // Registered number of student
    certificateName: String,
    certificateDate: Date,
    courseDuration: Number,
    certificateFile: String, // Path to the uploaded certificate file
    correspondingPoints: Number,
    prize: String,
    prizeMark: Number,
    level: String,
    verified: Boolean
});

const Certificate = mongoose.model('Certificate', certificateSchema);

// File Upload Storage Setup
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');  // Path where the files will be stored
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));  // File naming convention
    }
});

const upload = multer({ storage: storage });

// Serve the registration and login form
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'register.html'));
});

// Register User
app.post('/register', async (req, res) => {
    const { role, regd_no, name, dob, gender, blood_group, program, email, password } = req.body;

    // Check if the user already exists
    const existingUser = await Users.findOne({ email });
    if (existingUser) {
        return res.send("User already exists!");
    }

    // Hash Password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create new user
    const user = new Users({
        role,
        regd_no,
        name,
        dob,
        gender,
        blood_group,
        program,
        email,
        password: hashedPassword
    });

    await user.save();
    console.log("User Registered:", user);
    res.send("Registration Successful! You can now log in.");
});

// Login User
app.post('/login', async (req, res) => {
    const { email, password } = req.body;

    // Find user in DB
    const user = await Users.findOne({ email });
    if (!user) {
        return res.send("User not found!");
    }

    // Check password
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
        return res.send("Invalid credentials!");
    }

    req.session.user = user;

    // Role-based redirection
    if (user.role === 'faculty') {
        return res.redirect('/faculty'); // Redirect to faculty dashboard
    } else if (user.role === 'student') {
        return res.redirect('/student'); // Redirect to student dashboard
    } 
    else if (user.role === 'parent') {
        return res.redirect('/parent'); 
    }else {
        return res.send("Invalid role! Please contact administrator.");
    }
});

// Faculty Dashboard
app.get('/faculty', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'faculty') {
        return res.redirect('/'); // Redirect to login if not faculty
    }
    res.sendFile(path.join(__dirname, 'faculty.html')); // Load the faculty dashboard
});

// Student Dashboard
app.get('/student', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'student') {
        return res.redirect('/'); // Redirect to login if not student
    }
    res.sendFile(path.join(__dirname, 'student.html')); // Load the student dashboard
});

app.get('/parent', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'parent') {
        return res.redirect('/'); // Redirect to login if not student
    }
    res.sendFile(path.join(__dirname, 'parent.html')); // Load the student dashboard
});

// Route to view certificates for Student
app.get('/view-certificates', async (req, res) => {
    if (!req.session.user || req.session.user.role !== 'student') {
        return res.redirect('/'); // Redirect to login if not student
    }

    try {
        alert(req.session.user.regd_no);
        const certificates = await Certificate.find({ studentId: req.session.user.regd_no });
        alert(certificates);
        res.json(certificates); // Return certificates as JSON response
    } catch (err) {
        res.status(500).send("Error fetching certificates");
    }
});

// Faculty can view students' certificates and total points
app.get('/view-student-certificates/:studentId', async (req, res) => {
    /** if (!req.session.user || req.session.user.role !== 'faculty') {
        return res.redirect('/'); // Redirect to login if not faculty
    }**/

    try {
        const certificates = await Certificate.find({ studentId: req.params.studentId });

        // Calculate total points
        const totalPoints = certificates.reduce((acc, cert) => acc + cert.correspondingPoints, 0);

        res.json({
            certificates,
            totalPoints
        }); // Return certificates and total points for a specific student
    } catch (err) {
        res.status(500).send("Error fetching student certificates");
    }
});

// Handle POST request to store attendance
app.post('/submit-attendance', (req, res) => {
    const { subjectName, section, semester, batch, date, hour, students } = req.body;

    const newAttendance = new Attendance({
        subjectName,
        section,
        semester,
        batch,
        date,
        hour,
        students
    });
    console.log("Attendance:"+newAttendance);
    newAttendance.save()
        .then(() => res.status(200).send('Attendance saved successfully!'))
        .catch((err) => res.status(400).send('Error saving attendance: ' + err));
});
app.post('/api/attendance', async (req, res) => {
    try {
      const newAttendance = new Attendance(req.body);
      await newAttendance.save();
      res.status(200).json({ message: 'Attendance data saved successfully!' });
    } catch (error) {
      res.status(500).json({ message: 'Error saving attendance data', error });
    }
  });
  
  // GET route to fetch attendance data
  app.get('/api/attendance', async (req, res) => {
    try {
      const attendanceRecords = await Attendance.find();
      res.status(200).json(attendanceRecords);
    } catch (error) {
      res.status(500).json({ message: 'Error fetching attendance data', error });
    }
  });

  app.get('/attendance-view/:reg_no', async (req, res) => {
    const reg_no = req.params.reg_no;

    try {
        const { subjectName, date, hour } = req.query;  // Get query parameters

        const attendance = await Attendance.findOne({
            subjectName: subjectName,
            date: new Date(date),
            hour: hour
        });

        if (!attendance) {
            return res.status(404).json({ message: 'No attendance found for the provided details' });
        }

        res.json(attendance.students);  // Send back students' attendance
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Example route in your Node.js backend
app.get('//attendance-yearview/:reg_no', async (req, res) => {
    const { subjectName, section, semester, batch, date } = req.body;

    try {
            const attendanceRecords = await Attendance.find({
            subjectName: subjectName,
            section: section,
            semester: semester,
            batch: batch,
            // Optionally match the specific date or range, depending on requirements
        })
        .select({
            subjectName: 1,
            date: 1, // Assuming 'date' field in MongoDB stores the full date
            studentRollNo: 1,
            studentRegisterNo: 1,
            year: { $year: "$date" } // Extract the year from the date field
        });

        // Convert the data to Excel or any other format as needed
        // ...

        res.status(200).json(attendanceRecords);
    } catch (error) {
        console.error('Error retrieving attendance data:', error);
        res.status(500).send('Internal Server Error');
    }
});

// Route to upload marks (Faculty)
app.post('/upload-marks', async (req, res) => {
    const { regd_no, marks } = req.body;

    // Logic to upload marks for students
    res.send("Marks uploaded successfully!");
});

// Route to handle file upload and certificate creation
app.post('/upload-certificate', upload.single('certificateFile'), async (req, res) => {
    const { activityName, dateOfCertification, courseDuration, correspondingPoints, prize, prizeMark, level } = req.body;
    const certificateFile = req.file ? req.file.filename : null;

    if (!certificateFile) {
        return res.status(400).send({ error: 'Certificate file is required' });
    }

    try {
        // Create a new certificate document in the database
        const certificate = new Certificate({
            studentId: req.session.user.regd_no,  // Ensure the student ID is attached
            certificateName: activityName,
            certificateDate: new Date(dateOfCertification),
            certificateFile: certificateFile,
            courseDuration: courseDuration,
            correspondingPoints: parseInt(correspondingPoints),
            prize: prize || '',
            prizeMark: prizeMark ? parseInt(prizeMark) : 0,
            level: level || ''
        });

        await certificate.save();

        // Send the uploaded certificate back as a response
        res.json({
            activityName,
            dateOfCertification,
            courseDuration,
            correspondingPoints,
            prize,
            prizeMark,
            level,
            certificateFile: `/uploads/${certificateFile}`  // URL to view the uploaded certificate
        });
    } catch (err) {
        console.error('Error uploading certificate:', err);
        res.status(500).send({ error: 'Error uploading certificate' });
    }
});

app.get('/api/view-certificates', async (req, res) => {
    const studentId = req.query.studentId;

    try {
        // Query your database to find the certificates for the student
        const certificates = await CertificateModel.find({ studentId });
        res.json(certificates); // Return the certificates in JSON format
    } catch (error) {
        res.status(500).json({ error: 'Error fetching certificates' });
    }
});

// Route for faculty to fetch student certificates by studentId
app.get('/view-student-certificates/:studentId', async (req, res) => {
    const studentId = req.query.studentId;

    // Example: Faculty authorization check can be added here
    console.log("-----ERROR-------")
    try {
        // Find the student by the given studentId in the database
        const student = await Student.findOne({ studentId: req.params.studentId });

        if (student) {
            res.json(student1.certificates); // Return the certificates if student is found
        } else {
            res.status(404).json({ error: "No certificates found for this student." });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Server error. Please try again later." });
    }
});

// Define route to verify the certificate
app.post('/faculty/verify-certificate', async (req, res) => {
    const certId = req.query.id; // Get certificate ID from query parameters
    
    try {
        const certificate = await Certificate.findById(certId);
        if (certificate) 
        {
            // Toggle the 'verified' field (if true, set to false; if false, set to true)
            const verified = !certificate.verified;
            // Update the certificate's 'verified' field to true
            const updatedCertificate = await Certificate.findByIdAndUpdate(certId, { verified: verified }, { new: true });
            if (updatedCertificate) {
                res.json({ success: true, message: 'Certificate updated successfully' });
            } else {
                res.json({ success: false, message: 'Certificate not found' });
            }
        }
        
    } catch (error) {
        console.error('Error verifying certificate:', error);
        res.status(500).json({ success: false, error: 'Failed to verify certificate' });
    }
});


// Define Schema for attendance
const attendanceSchema = new mongoose.Schema({
    subjectName: String,
    section:String,
    semester:String,
    batch:String,
    date: String,
    hour: Number,
    students: [
        {
            rollNo: Number,
            registerNo: String,
            status: String
        }
    ]
});

// Creating a compound index on reg_no and marks.subject
attendanceSchema.index({ subjectName: 1, section: 1 , semester: 1, batch: 1 ,date: 1}, { unique: true });

const Attendance = mongoose.model('Attendance', attendanceSchema);

app.post('/download-attendance-report', async (req, res) => {
    const { subjectName, section, semester, batch, date } = req.body;

    console.log(subjectName, section, semester, batch, date);
    try {
        // Fetch attendance from the database
        const attendance = await Attendance.findOne({ subjectName, section, semester, batch, date });
        console.log(attendance);

        if (!attendance) {
            return res.status(404).send('Attendance not found');
        }

        // Create a new workbook and worksheet
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Attendance Report');

        console.log("Created",worksheet);
        // Add headers
        worksheet.columns = [
            { header: 'Subject Name', key: 'subjectName', width: 20 },
            { header: 'Section', key: 'section', width: 10 },
            { header: 'Semester', key: 'semester', width: 10 },
            { header: 'Batch', key: 'batch', width: 10 },
            { header: 'Date', key: 'date', width: 15 },
            { header: 'Hour Number', key: 'hour', width: 10 },
            { header: 'Student Roll No', key: 'rollNo', width: 15 },
            { header: 'Student Register No', key: 'registerNo', width: 20 },
            { header: 'Status', key: 'status', width: 10 }
        ];

        // Add rows
        attendance.students.forEach(student => {
            worksheet.addRow({
                subjectName: attendance.subjectName,
                section: attendance.section,
                semester: attendance.semester,
                batch: attendance.batch,
                date: attendance.date,
                hour: attendance.hour,
                rollNo: student.rollNo,
                registerNo: student.registerNo,
                status: student.status
            });
        });

        console.log("Created",worksheet);
        // Write the workbook to a buffer and send as response
        const buffer = await workbook.xlsx.writeBuffer();
        res.setHeader('Content-Disposition', 'attachment; filename="attendance_report.xlsx"');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(buffer);
        console.log("Done",res);
    } catch (error) {
        res.status(500).send('Error generating report');
    }
});

app.post('/download-yearly-report', async (req, res) => {
    console.log("Inside the api")
    const { year, registno } = req.body;
    console.log(year, registno)
    try {
        // Query attendance records based on year and register number
        const attendanceRecords = await Attendance.find({
            'students.registerNo': registno,
            date: { $regex: `^${year}` } // Matching the year at the start of the date string
          }).exec();

        console.log(attendanceRecords)
        if (!attendanceRecords || attendanceRecords.length === 0) {
            return res.status(404).json({ message: 'No attendance records found for the specified year and registration number' });
        }

        // Create Excel file
        const workbook = new ExcelJS.Workbook(); // Create a new workbook
        const worksheet = workbook.addWorksheet('Attendance Report'); // Add new worksheet

        // Add headers to the worksheet
        worksheet.columns = [
            { header: 'Subject Name', key: 'subjectName', width: 20 },
            { header: 'Date', key: 'date', width: 15 },
            { header: 'Hour', key: 'hour', width: 10 },
            { header: 'Roll No', key: 'rollNo', width: 10 },
            { header: 'Register No', key: 'registerNo', width: 15 },
            { header: 'Status', key: 'status', width: 10 }
        ];

        // Add data to the worksheet
        attendanceRecords.forEach(record => {
            worksheet.addRow({
                subjectName: record.subjectName,
                date: record.date,
                hour: record.hour,
                rollNo: record.students.rollNo,
                registerNo: record.students.registerNo,
                status: record.students.status
            });
        });

        // Set the response headers and send the Excel file
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=attendance_report.xlsx');

        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        console.error('Error generating attendance report:', error);
        res.status(500).send('Internal Server Error');
    }
});


// Define a message schema for storing chat messages
const messageSchema = new mongoose.Schema({
    sender: String,
    recipient: String, // 'class' for group or specific student regNo
    message: String,
    timestamp: { type: Date, default: Date.now }
});

const Message = mongoose.model('Message', messageSchema);

// Faculty sends a message route
app.post('/api/messages/send', async (req, res) => {
    const { sender, recipient, message } = req.body;

    try {
        const newMessage = new Message({ sender, recipient, message });
        await newMessage.save();
        res.status(200).json({ success: true, message: 'Message sent successfully' });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Error sending message' });
    }
});

// Fetch messages for a student using regNo
app.get('/api/messages/view-messages/:regNo', async (req, res) => {
    const regNo = req.params.regNo;
    
    try {
        // Fetch messages sent either to the class or specifically to the student
        const messages = await Message.find({
            $or: [{ recipient: regNo }, { recipient: 'class' }]
        }).sort({ timestamp: 1 });

        res.json(messages);
    } catch (error) {
        res.status(500).json({ success: false, error: 'Error fetching messages' });
    }
});



// Logout
app.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.send("Logged out successfully!");
    });
});

app.listen(port, () => {
    console.log(`Server started on port ${port}`);
});


