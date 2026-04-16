// frontend/dashboard.js
document.addEventListener('DOMContentLoaded', loadLeads);

// Handle Form Submission
document.getElementById('add-lead-form').addEventListener('submit', addLead);

async function loadLeads() {
    try {
        const response = await fetch('/api/leads/');
        const leads = await response.json();
        const tbody = document.getElementById('leads-table');
        tbody.innerHTML = '';

        leads.forEach(lead => {
            const row = document.createElement('tr');
            
            // Determine badge color based on status
            let badgeClass = 'status-new';
            if(lead.status === 'interested') badgeClass = 'status-interested';
            if(lead.status === 'converted') badgeClass = 'status-converted';

            row.innerHTML = `
                <td>${lead.id}</td>
                <td>${lead.name || 'Unknown'}</td>
                <td>${lead.phone || '-'}</td>
                <td>${lead.intent}</td>
                <td><span class="badge ${badgeClass}">${lead.status}</span></td>
                <td>${lead.plan_selected || '-'}</td>
                <td>
                    <a href="index.html?lead_id=${lead.id}" class="btn btn-chat">Chat</a>
                </td>
            `;
            tbody.appendChild(row);
        });
    } catch (error) {
        console.error('Error loading leads:', error);
        alert('Failed to load leads.');
    }
}

async function addLead(event) {
    event.preventDefault(); // Stop page reload

    const name = document.getElementById('lead-name').value;
    const phone = document.getElementById('lead-phone').value;

    if (!name || !phone) {
        alert("Please enter both name and phone.");
        return;
    }

    try {
        const response = await fetch('/api/leads/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name: name, phone: phone })
        });

        if (response.ok) {
            // Clear form
            document.getElementById('lead-name').value = '';
            document.getElementById('lead-phone').value = '';
            alert("Lead added successfully!");
            loadLeads(); // Refresh table
        } else {
            alert("Failed to add lead.");
        }
    } catch (error) {
        console.error('Error:', error);
        alert("Error adding lead.");
    }
}