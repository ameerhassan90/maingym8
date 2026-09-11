document.addEventListener('DOMContentLoaded', async () => {
    try {
        const response = await fetch('/api/data');
        if (!response.ok) throw new Error('Failed to fetch site data');
        const data = await response.json();

        renderSiteInfo(data.site);
        renderTrainers(data.trainers);
        renderPrograms(data.programs);
        renderPricing(data.pricing);
        renderSchedule(data.schedule);
        renderTestimonials(data.testimonials);
    } catch (error) {
        console.error('Error initializing application:', error);
    }
});

function renderSiteInfo(site) {
    if (!site) return;
    setElementText('site-name', site.name);
    setElementText('site-tagline', site.tagline);
    setElementText('site-desc', site.description);
    setElementText('footer-phone', site.phone);
    setElementText('footer-email', site.email);
    setElementText('footer-address', site.address);
}

function renderTrainers(trainers = []) {
    const container = document.getElementById('trainers-container');
    if (!container) return;
    container.innerHTML = trainers.map(trainer => `
        <div class="trainer-card">
            <img src="${trainer.image}" alt="${trainer.name}" loading="lazy">
            <h3>${trainer.name}</h3>
            <span class="role">${trainer.role}</span>
            <p>${trainer.bio}</p>
        </div>
    `).join('');
}

function renderPrograms(programs = []) {
    const container = document.getElementById('programs-container');
    if (!container) return;
    container.innerHTML = programs.map(program => `
        <div class="program-card">
            <h3>${program.name}</h3>
            <p>${program.description}</p>
        </div>
    `).join('');
}

function renderPricing(pricing = []) {
    const container = document.getElementById('pricing-container');
    if (!container) return;
    container.innerHTML = pricing.map(plan => `
        <div class="pricing-card">
            <h3>${plan.title}</h3>
            <div class="price">${plan.price}</div>
            <ul>
                ${plan.features.map(feature => `<li>${feature}</li>`).join('')}
            </ul>
        </div>
    `).join('');
}

function renderSchedule(schedule = []) {
    const container = document.getElementById('schedule-container');
    if (!container) return;
    container.innerHTML = schedule.map(item => `
        <div class="schedule-item">
            <span class="day">${item.day}</span>
            <span class="time">${item.time}</span>
            <span class="class-name">${item.className}</span>
            <span class="coach">${item.coach}</span>
        </div>
    `).join('');
}

function renderTestimonials(testimonials = []) {
    const container = document.getElementById('testimonials-container');
    if (!container) return;
    container.innerHTML = testimonials.map(item => `
        <div class="testimonial-card">
            <p>"${item.text}"</p>
            <h4>- ${item.author}</h4>
        </div>
    `).join('');
}

function setElementText(id, text) {
    const element = document.getElementById(id);
    if (element && text) element.textContent = text;
}
