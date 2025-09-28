const { 
    sendAppointmentConfirmation, 
    sendAppointmentCancellation,
    sendAppointmentReminder 
} = require('./services/emailService');
const express = require('express');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('.')); // Serve all HTML files from root

// Database connection
const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'hospital_appointment_system',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// JWT authentication middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Invalid token' });
        req.user = user;
        next();
    });
};

// ==================== PATIENT ENDPOINTS ====================

// 1. Patient Registration
app.post('/api/register', async (req, res) => {
    try {
        const { name, email, phone, password } = req.body;
        
        // Check if patient already exists
        const [existing] = await pool.execute(
            'SELECT id FROM patients WHERE email = ?', 
            [email]
        );
        
        if (existing.length > 0) {
            return res.status(400).json({ error: 'Patient already exists' });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Create patient
        const [result] = await pool.execute(
            'INSERT INTO patients (name, email, phone, password_hash) VALUES (?, ?, ?, ?)',
            [name, email, phone, hashedPassword]
        );

        // Generate JWT token
        const token = jwt.sign(
            { id: result.insertId, email: email, type: 'patient' },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({ 
            message: 'Patient registered successfully', 
            token: token,
            patient: { id: result.insertId, name, email, phone }
        });

    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// 2. Patient Login
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        // Find patient
        const [patients] = await pool.execute(
            'SELECT * FROM patients WHERE email = ?', 
            [email]
        );
        
        if (patients.length === 0) {
            return res.status(400).json({ error: 'Invalid email or password' });
        }

        const patient = patients[0];

        // Check password
        const validPassword = await bcrypt.compare(password, patient.password_hash);
        if (!validPassword) {
            return res.status(400).json({ error: 'Invalid email or password' });
        }

        // Generate token
        const token = jwt.sign(
            { id: patient.id, email: patient.email, type: 'patient' },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({ 
            message: 'Login successful', 
            token: token,
            patient: { id: patient.id, name: patient.name, email: patient.email, phone: patient.phone }
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// 3. Get All Services
app.get('/api/services', async (req, res) => {
    try {
        const [services] = await pool.execute('SELECT * FROM services');
        res.json(services);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch services' });
    }
});

// 4. Book Appointment (UPDATED with email notification)
app.post('/api/appointments', authenticateToken, async (req, res) => {
    try {
        const { service_id, appointment_date, appointment_time, notes, service_name } = req.body;
        const patient_id = req.user.id;

        // Get patient details for email
        const [patients] = await pool.execute(
            'SELECT name, email FROM patients WHERE id = ?',
            [patient_id]
        );

        if (patients.length === 0) {
            return res.status(404).json({ error: 'Patient not found' });
        }

        const patient = patients[0];

        // Find a doctor based on service type
        let doctor_id = null;
        let doctor_name = null;
        
        const serviceToSpecialization = {
            'Pediatrics': 'Pediatrician',
            'Neurology': 'Neurologist', 
            'Cardiology': 'Cardiologist',
            'General Physician': 'General Physician',
            'Emergency': 'Emergency',
            'Immunization': 'General Physician'
        };

        const specialization = serviceToSpecialization[service_name] || 'General Physician';

        const [doctors] = await pool.execute(
            'SELECT id, name FROM doctors WHERE specialization LIKE ? LIMIT 1',
            [`%${specialization}%`]
        );

        if (doctors.length > 0) {
            doctor_id = doctors[0].id;
            doctor_name = doctors[0].name;
        }

        const [result] = await pool.execute(
            `INSERT INTO appointments (patient_id, doctor_id, service_id, appointment_date, appointment_time, notes) 
             VALUES (?, ?, ?, ?, ?, ?)`,
            [patient_id, doctor_id, service_id, appointment_date, appointment_time, notes]
        );

        // Send confirmation email (don't await - send in background)
        const appointmentData = {
            id: result.insertId,
            patientName: patient.name,
            serviceName: service_name,
            date: appointment_date,
            time: appointment_time,
            doctorName: doctor_name,
            notes: notes
        };

        sendAppointmentConfirmation(patient.email, appointmentData)
            .then(emailResult => {
                if (emailResult.success) {
                    console.log('Confirmation email sent to:', patient.email);
                } else {
                    console.error('Failed to send confirmation email:', emailResult.error);
                }
            });

        res.json({ 
            message: 'Appointment booked successfully', 
            appointment_id: result.insertId,
            doctor_assigned: !!doctor_id,
            email_sent: true
        });

    } catch (error) {
        console.error('Appointment error:', error);
        res.status(500).json({ error: 'Failed to book appointment' });
    }
});

// 5. Get Patient Appointments
app.get('/api/my-appointments', authenticateToken, async (req, res) => {
    try {
        const [appointments] = await pool.execute(
            `SELECT a.*, s.name as service_name, d.name as doctor_name 
             FROM appointments a 
             JOIN services s ON a.service_id = s.id 
             LEFT JOIN doctors d ON a.doctor_id = d.id 
             WHERE a.patient_id = ? 
             ORDER BY a.appointment_date DESC, a.appointment_time DESC`,
            [req.user.id]
        );

        res.json(appointments);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch appointments' });
    }
});

// 6. Cancel Appointment (UPDATED with email notification)
app.put('/api/appointments/:id/cancel', authenticateToken, async (req, res) => {
    try {
        const appointmentId = req.params.id;
        const patient_id = req.user.id;

        // Get appointment details with patient info
        const [appointments] = await pool.execute(
            `SELECT a.*, p.name as patient_name, p.email, s.name as service_name, d.name as doctor_name
             FROM appointments a 
             JOIN patients p ON a.patient_id = p.id 
             JOIN services s ON a.service_id = s.id 
             LEFT JOIN doctors d ON a.doctor_id = d.id 
             WHERE a.id = ? AND a.patient_id = ?`,
            [appointmentId, patient_id]
        );

        if (appointments.length === 0) {
            return res.status(404).json({ error: 'Appointment not found' });
        }

        const appointment = appointments[0];

        // Update appointment status to cancelled
        await pool.execute(
            'UPDATE appointments SET status = ? WHERE id = ?',
            ['cancelled', appointmentId]
        );

        // Send cancellation email
        const appointmentData = {
            id: appointment.id,
            patientName: appointment.patient_name,
            serviceName: appointment.service_name,
            date: appointment.appointment_date,
            time: appointment.appointment_time,
            doctorName: appointment.doctor_name
        };

        sendAppointmentCancellation(appointment.email, appointmentData)
            .then(emailResult => {
                if (emailResult.success) {
                    console.log('Cancellation email sent to:', appointment.email);
                } else {
                    console.error('Failed to send cancellation email:', emailResult.error);
                }
            });

        res.json({ message: 'Appointment cancelled successfully' });

    } catch (error) {
        console.error('Cancel appointment error:', error);
        res.status(500).json({ error: 'Failed to cancel appointment' });
    }
});

// ==================== DOCTOR ENDPOINTS ====================

// 7. Doctor Login
app.post('/api/doctor-login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        const [doctors] = await pool.execute(
            'SELECT * FROM doctors WHERE email = ?', 
            [email]
        );
        
        if (doctors.length === 0) {
            return res.status(400).json({ error: 'Invalid doctor credentials' });
        }

        const doctor = doctors[0];

        // Simple password check (for MVP)
        if (password !== 'doctor123') {
            return res.status(400).json({ error: 'Invalid doctor credentials' });
        }

        const token = jwt.sign(
            { id: doctor.id, email: doctor.email, type: 'doctor' },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({ 
            message: 'Doctor login successful', 
            token: token,
            doctor: { id: doctor.id, name: doctor.name, email: doctor.email, specialization: doctor.specialization }
        });

    } catch (error) {
        res.status(500).json({ error: 'Login failed' });
    }
});

// 8. Get Doctor's Appointments
app.get('/api/doctor-appointments', authenticateToken, async (req, res) => {
    try {
        if (req.user.type !== 'doctor') {
            return res.status(403).json({ error: 'Access denied. Doctors only.' });
        }

        const [appointments] = await pool.execute(
            `SELECT a.*, p.name as patient_name, s.name as service_name 
             FROM appointments a 
             JOIN patients p ON a.patient_id = p.id 
             JOIN services s ON a.service_id = s.id 
             WHERE (a.doctor_id = ? OR a.doctor_id IS NULL)
             AND a.status = 'scheduled'
             ORDER BY a.appointment_date ASC, a.appointment_time ASC`,
            [req.user.id]
        );

        res.json(appointments);
    } catch (error) {
        console.error('Doctor appointments error:', error);
        res.status(500).json({ error: 'Failed to fetch appointments' });
    }
});

// 9. Update Appointment Status
app.put('/api/appointments/:id/status', authenticateToken, async (req, res) => {
    try {
        if (req.user.type !== 'doctor') {
            return res.status(403).json({ error: 'Access denied. Doctors only.' });
        }

        const appointmentId = req.params.id;
        const { status } = req.body;

        const [appointments] = await pool.execute(
            'SELECT * FROM appointments WHERE id = ? AND (doctor_id = ? OR doctor_id IS NULL)',
            [appointmentId, req.user.id]
        );

        if (appointments.length === 0) {
            return res.status(404).json({ error: 'Appointment not found or access denied' });
        }

        await pool.execute(
            'UPDATE appointments SET status = ? WHERE id = ?',
            [status, appointmentId]
        );

        res.json({ message: `Appointment ${status} successfully` });

    } catch (error) {
        console.error('Update appointment status error:', error);
        res.status(500).json({ error: 'Failed to update appointment status' });
    }
});

// ==================== ADMIN ENDPOINTS ====================

// 10. Admin endpoints
app.get('/api/admin/appointments', async (req, res) => {
    try {
        console.log('Fetching all appointments for admin...');
        
        const [appointments] = await pool.execute(
            `SELECT a.*, p.name as patient_name, d.name as doctor_name, s.name as service_name 
             FROM appointments a 
             LEFT JOIN patients p ON a.patient_id = p.id 
             LEFT JOIN doctors d ON a.doctor_id = d.id 
             LEFT JOIN services s ON a.service_id = s.id 
             ORDER BY a.appointment_date DESC, a.appointment_time DESC`
        );
        
        console.log(`Found ${appointments.length} appointments`);
        res.json(appointments);
    } catch (error) {
        console.error('Admin appointments error:', error);
        res.status(500).json({ error: 'Failed to fetch appointments' });
    }
});

app.get('/api/admin/patients', async (req, res) => {
    try {
        console.log('Fetching all patients for admin...');
        
        const [patients] = await pool.execute(
            `SELECT p.*, COUNT(a.id) as appointment_count 
             FROM patients p 
             LEFT JOIN appointments a ON p.id = a.patient_id 
             GROUP BY p.id 
             ORDER BY p.created_at DESC`
        );
        
        console.log(`Found ${patients.length} patients`);
        res.json(patients);
    } catch (error) {
        console.error('Admin patients error:', error);
        res.status(500).json({ error: 'Failed to fetch patients' });
    }
});

app.get('/api/admin/doctors', async (req, res) => {
    try {
        console.log('Fetching all doctors for admin...');
        
        const [doctors] = await pool.execute(
            `SELECT d.*, COUNT(a.id) as appointment_count 
             FROM doctors d 
             LEFT JOIN appointments a ON d.id = a.doctor_id 
             GROUP BY d.id 
             ORDER BY d.name ASC`
        );
        
        console.log(`Found ${doctors.length} doctors`);
        res.json(doctors);
    } catch (error) {
        console.error('Admin doctors error:', error);
        res.status(500).json({ error: 'Failed to fetch doctors' });
    }
});

// 11. Admin statistics endpoint
app.get('/api/admin/statistics', async (req, res) => {
    try {
        console.log('Fetching admin statistics...');
        
        // Get today's date in YYYY-MM-DD format
        const today = new Date().toISOString().split('T')[0];
        
        // Execute all statistics queries
        const [totalAppointments] = await pool.execute('SELECT COUNT(*) as count FROM appointments');
        const [todayAppointments] = await pool.execute('SELECT COUNT(*) as count FROM appointments WHERE appointment_date = ?', [today]);
        const [totalPatients] = await pool.execute('SELECT COUNT(*) as count FROM patients');
        const [totalDoctors] = await pool.execute('SELECT COUNT(*) as count FROM doctors');
        
        const statistics = {
            totalAppointments: totalAppointments[0].count,
            todayAppointments: todayAppointments[0].count,
            totalPatients: totalPatients[0].count,
            totalDoctors: totalDoctors[0].count
        };
        
        console.log('Statistics:', statistics);
        res.json(statistics);
    } catch (error) {
        console.error('Admin statistics error:', error);
        res.status(500).json({ error: 'Failed to fetch statistics' });
    }
});

// Test endpoint
app.get('/api/test', async (req, res) => {
    try {
        const connection = await pool.getConnection();
        const [rows] = await connection.execute('SELECT 1 + 1 AS solution');
        connection.release();
        res.json({ message: 'Database connected!', result: rows[0].solution });
    } catch (error) {
        res.status(500).json({ error: 'Database connection failed' });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`Hospital Appointment System API running on http://localhost:${PORT}`);
    console.log('Available endpoints:');
    console.log('- GET  /api/services');
    console.log('- POST /api/register');
    console.log('- POST /api/login');
    console.log('- POST /api/appointments');
    console.log('- GET  /api/my-appointments');
    console.log('- GET  /api/admin/appointments');
    console.log('- GET  /api/admin/patients');
    console.log('- GET  /api/admin/doctors');
    console.log('- GET  /api/admin/statistics');
});