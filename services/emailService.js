const nodemailer = require('nodemailer');

// Create transporter
const transporter = nodemailer.createTransport({
    service: process.env.EMAIL_SERVICE || 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// Verify transporter configuration
transporter.verify(function (error, success) {
    if (error) {
        console.log('Email transporter error:', error);
    } else {
        console.log('Email server is ready to send messages');
    }
});

// Email templates
const emailTemplates = {
    appointmentConfirmation: (appointment) => `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: #007bff; color: white; padding: 20px; text-align: center; }
                .content { background: #f9f9f9; padding: 20px; }
                .footer { background: #f1f1f1; padding: 10px; text-align: center; font-size: 12px; }
                .appointment-details { background: white; padding: 15px; border-radius: 5px; margin: 15px 0; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>🏥 Hospital Appointment System</h1>
                    <h2>Appointment Confirmed</h2>
                </div>
                <div class="content">
                    <p>Dear <strong>${appointment.patientName}</strong>,</p>
                    <p>Your appointment has been successfully booked. Here are your appointment details:</p>
                    
                    <div class="appointment-details">
                        <h3>Appointment Details</h3>
                        <p><strong>Service:</strong> ${appointment.serviceName}</p>
                        <p><strong>Date:</strong> ${new Date(appointment.date).toLocaleDateString()}</p>
                        <p><strong>Time:</strong> ${appointment.time}</p>
                        <p><strong>Appointment ID:</strong> ${appointment.id}</p>
                        ${appointment.doctorName ? `<p><strong>Doctor:</strong> Dr. ${appointment.doctorName}</p>` : ''}
                        ${appointment.notes ? `<p><strong>Notes:</strong> ${appointment.notes}</p>` : ''}
                    </div>
                    
                    <p><strong>Important Reminders:</strong></p>
                    <ul>
                        <li>Please arrive 15 minutes before your scheduled time</li>
                        <li>Bring your ID and insurance card</li>
                        <li>Cancel at least 24 hours in advance if you cannot make it</li>
                    </ul>
                    
                    <p>If you need to reschedule or cancel, please visit your patient dashboard.</p>
                </div>
                <div class="footer">
                    <p>Thank you for choosing our hospital services.</p>
                    <p>© 2024 Hospital Appointment System. All rights reserved.</p>
                </div>
            </div>
        </body>
        </html>
    `,

    appointmentCancellation: (appointment) => `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: #dc3545; color: white; padding: 20px; text-align: center; }
                .content { background: #f9f9f9; padding: 20px; }
                .footer { background: #f1f1f1; padding: 10px; text-align: center; font-size: 12px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>🏥 Hospital Appointment System</h1>
                    <h2>Appointment Cancelled</h2>
                </div>
                <div class="content">
                    <p>Dear <strong>${appointment.patientName}</strong>,</p>
                    <p>Your appointment has been cancelled as requested.</p>
                    
                    <div style="background: white; padding: 15px; border-radius: 5px; margin: 15px 0;">
                        <h3>Cancelled Appointment Details</h3>
                        <p><strong>Service:</strong> ${appointment.serviceName}</p>
                        <p><strong>Original Date:</strong> ${new Date(appointment.date).toLocaleDateString()}</p>
                        <p><strong>Original Time:</strong> ${appointment.time}</p>
                        <p><strong>Appointment ID:</strong> ${appointment.id}</p>
                    </div>
                    
                    <p>If this was a mistake or you'd like to reschedule, please visit our appointment system.</p>
                    <p>We hope to serve you in the future.</p>
                </div>
                <div class="footer">
                    <p>© 2024 Hospital Appointment System. All rights reserved.</p>
                </div>
            </div>
        </body>
        </html>
    `,

    appointmentReminder: (appointment) => `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: #28a745; color: white; padding: 20px; text-align: center; }
                .content { background: #f9f9f9; padding: 20px; }
                .footer { background: #f1f1f1; padding: 10px; text-align: center; font-size: 12px; }
                .reminder { background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>🏥 Hospital Appointment System</h1>
                    <h2>Appointment Reminder</h2>
                </div>
                <div class="content">
                    <p>Dear <strong>${appointment.patientName}</strong>,</p>
                    
                    <div class="reminder">
                        <h3>📅 You have an appointment tomorrow!</h3>
                    </div>
                    
                    <div style="background: white; padding: 15px; border-radius: 5px; margin: 15px 0;">
                        <h3>Appointment Details</h3>
                        <p><strong>Service:</strong> ${appointment.serviceName}</p>
                        <p><strong>Date:</strong> ${new Date(appointment.date).toLocaleDateString()} (Tomorrow)</p>
                        <p><strong>Time:</strong> ${appointment.time}</p>
                        <p><strong>Appointment ID:</strong> ${appointment.id}</p>
                        ${appointment.doctorName ? `<p><strong>Doctor:</strong> Dr. ${appointment.doctorName}</p>` : ''}
                    </div>
                    
                    <p><strong>Please remember to:</strong></p>
                    <ul>
                        <li>Arrive 15 minutes early</li>
                        <li>Bring your ID and insurance information</li>
                        <li>Bring any relevant medical records</li>
                    </ul>
                    
                    <p>If you need to reschedule, please contact us as soon as possible.</p>
                </div>
                <div class="footer">
                    <p>© 2024 Hospital Appointment System. All rights reserved.</p>
                </div>
            </div>
        </body>
        </html>
    `
};

// Send email function
async function sendEmail(to, subject, html) {
    try {
        const mailOptions = {
            from: process.env.EMAIL_FROM,
            to: to,
            subject: subject,
            html: html
        };

        const result = await transporter.sendMail(mailOptions);
        console.log('Email sent successfully to:', to);
        return { success: true, messageId: result.messageId };
    } catch (error) {
        console.error('Error sending email:', error);
        return { success: false, error: error.message };
    }
}

// Specific email functions
async function sendAppointmentConfirmation(patientEmail, appointmentData) {
    const html = emailTemplates.appointmentConfirmation(appointmentData);
    return await sendEmail(patientEmail, 'Appointment Confirmation - Hospital Appointment System', html);
}

async function sendAppointmentCancellation(patientEmail, appointmentData) {
    const html = emailTemplates.appointmentCancellation(appointmentData);
    return await sendEmail(patientEmail, 'Appointment Cancelled - Hospital Appointment System', html);
}

async function sendAppointmentReminder(patientEmail, appointmentData) {
    const html = emailTemplates.appointmentReminder(appointmentData);
    return await sendEmail(patientEmail, 'Appointment Reminder - Hospital Appointment System', html);
}

module.exports = {
    sendAppointmentConfirmation,
    sendAppointmentCancellation,
    sendAppointmentReminder,
    sendEmail
};