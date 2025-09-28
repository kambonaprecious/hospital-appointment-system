async function submitAppointment(event) {
    event.preventDefault();
    
    if (!isLoggedIn()) {
        alert('Please login or register first to book an appointment.');
        window.location.href = 'login.html';
        return;
    }

    const serviceSelect = document.getElementById('service_selected');
    const formData = {
        service_id: serviceSelect.value,
        appointment_date: document.getElementById('date').value,
        appointment_time: document.getElementById('time').value,
        notes: document.getElementById('message').value,
        service_name: serviceSelect.options[serviceSelect.selectedIndex].text
    };

    console.log('Submitting appointment:', formData); // Debug log

    try {
        const result = await makeAuthRequest(`${API_BASE}/appointments`, {
            method: 'POST',
            body: JSON.stringify(formData)
        });

        console.log('Appointment booking response:', result); // Debug log
        
        alert('Appointment booked successfully! Appointment ID: ' + result.appointment_id);
        window.location.href = 'patient-dashboard.html';
        
    } catch (error) {
        console.error('Appointment booking error:', error); // Debug log
        alert('Failed to book appointment: ' + error.message);
    }
}