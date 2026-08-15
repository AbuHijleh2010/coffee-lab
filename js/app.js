/* ==========================================================================
   COFFEE LAB - APPLICATION UI & CONTROLLER LOGIC
   ========================================================================== */

let state = {
    employees: [],
    evaluations: [],
    filterSearch: '',
    filterRole: 'all'
};

document.addEventListener('DOMContentLoaded', async () => {
    try {
        // 1. Initialize Supabase Service
        const connected = initSupabaseService();
        updateConnectionUI(connected);

        // 2. Set default date to today in evaluation form
        const dateInput = document.getElementById('evaluationDate');
        if (dateInput) {
            dateInput.value = new Date().toISOString().split('T')[0];
        }

        // 3. Register Event Listeners
        setupEventListeners();
    } catch (err) {
        console.warn('Initialization warning:', err);
    }

    // 4. Load Data & Render (Guaranteed Execution)
    await refreshAppData();
});

/**
 * Setup Event Listeners
 */
function setupEventListeners() {
    // Nav buttons
    const newEvalBtn = document.getElementById('newEvaluationBtn');
    if (newEvalBtn) newEvalBtn.addEventListener('click', () => openEvaluationModal());

    const addEmpBtn = document.getElementById('addEmployeeBtn');
    if (addEmpBtn) addEmpBtn.addEventListener('click', () => openModal('addEmployeeModal'));

    const cfgBtn = document.getElementById('supabaseConfigBtn');
    if (cfgBtn) cfgBtn.addEventListener('click', () => openConfigModal());

    // Search and Role Filter
    document.getElementById('searchInput').addEventListener('input', (e) => {
        state.filterSearch = e.target.value.trim().toLowerCase();
        renderEmployeesGrid();
    });

    document.getElementById('roleFilter').addEventListener('change', (e) => {
        state.filterRole = e.target.value;
        renderEmployeesGrid();
    });

    // Form Submissions
    const evalForm = document.getElementById('evaluationForm');
    if (evalForm) evalForm.addEventListener('submit', handleEvaluationSubmit);

    const addEmpForm = document.getElementById('addEmployeeForm');
    if (addEmpForm) addEmpForm.addEventListener('submit', handleAddEmployeeSubmit);
    
    // Supabase Config Form
    const btnSave = document.getElementById('btnSaveConfig');
    if (btnSave) btnSave.addEventListener('click', handleSaveSupabaseConfig);

    const btnClear = document.getElementById('btnClearConfig');
    if (btnClear) btnClear.addEventListener('click', handleClearSupabaseConfig);

    // Star rating interactions for evaluation form
    setupStarRatingInputs();
}

/**
 * Setup Star Rating Interactive Click Selectors
 */
function setupStarRatingInputs() {
    const starContainers = document.querySelectorAll('.star-rating-input');
    starContainers.forEach(container => {
        const targetId = container.getAttribute('data-rating-target');
        const hiddenInput = document.getElementById(targetId);
        const ratingValSpan = container.querySelector('.rating-num');
        const stars = container.querySelectorAll('.stars i');

        stars.forEach(star => {
            star.addEventListener('click', () => {
                const val = parseInt(star.getAttribute('data-val'));
                hiddenInput.value = val;
                ratingValSpan.textContent = `${val}/5`;

                // Update visual star classes
                stars.forEach(s => {
                    const sVal = parseInt(s.getAttribute('data-val'));
                    if (sVal <= val) {
                        s.classList.add('active');
                    } else {
                        s.classList.remove('active');
                    }
                });
            });
        });
    });
}

/**
 * Refresh All Application Data from Backend / Storage
 */
async function refreshAppData() {
    try {
        state.employees = await fetchEmployees();
        state.evaluations = await fetchEvaluations();

        updateStatsWidget();
        populateEmployeeSelectDropdown();
        renderEmployeesGrid();
    } catch (err) {
        console.error('Error refreshing app data:', err);
        showToast('حدث خطأ أثناء تحميل البيانات', 'danger');
    }
}

/**
 * Update Dashboard Header Statistics
 */
function updateStatsWidget() {
    const totalEmployees = state.employees.length;
    const totalEvaluations = state.evaluations.length;

    // Calculate overall average score
    let overallAvg = 0;
    if (totalEvaluations > 0) {
        const sum = state.evaluations.reduce((acc, curr) => acc + parseFloat(curr.rating || 0), 0);
        overallAvg = (sum / totalEvaluations).toFixed(1);
    }

    // Determine Top Employee
    let topEmployeeName = '-';
    if (totalEmployees > 0 && totalEvaluations > 0) {
        let bestRating = -1;
        state.employees.forEach(emp => {
            const empEvals = state.evaluations.filter(e => e.employee_id === emp.id);
            if (empEvals.length > 0) {
                const avg = empEvals.reduce((acc, c) => acc + parseFloat(c.rating || 0), 0) / empEvals.length;
                if (avg > bestRating) {
                    bestRating = avg;
                    topEmployeeName = emp.name;
                }
            }
        });
    }

    document.getElementById('statTotalEmployees').textContent = totalEmployees;
    document.getElementById('statAvgRating').textContent = overallAvg + ' ★';
    document.getElementById('statTotalEvaluations').textContent = totalEvaluations;
    document.getElementById('statTopEmployee').textContent = topEmployeeName;
}

/**
 * Populate Employee Select List inside Evaluation Form
 */
function populateEmployeeSelectDropdown() {
    const select = document.getElementById('evalEmployeeSelect');
    select.innerHTML = '<option value="">-- اختر موظف من القائمة --</option>';

    state.employees.forEach(emp => {
        const option = document.createElement('option');
        option.value = emp.id;
        option.textContent = `${emp.name} (${emp.role})`;
        select.appendChild(option);
    });
}

/**
 * Render Employee Cards Grid with Filters Applied
 */
function renderEmployeesGrid() {
    const grid = document.getElementById('employeesGrid');
    grid.innerHTML = '';

    const filtered = state.employees.filter(emp => {
        const matchesSearch = emp.name.toLowerCase().includes(state.filterSearch) ||
                              emp.role.toLowerCase().includes(state.filterSearch);
        const matchesRole = state.filterRole === 'all' || emp.role === state.filterRole;
        return matchesSearch && matchesRole;
    });

    if (filtered.length === 0) {
        grid.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 3rem; background: var(--bg-card); border-radius: var(--radius-lg); border: 1px dashed var(--border-color);">
                <i class="fa-solid fa-mug-hot" style="font-size: 3rem; color: var(--text-dim); margin-bottom: 1rem; display: block;"></i>
                <h3 style="color: var(--text-muted);">لا يوجد موظفين يطابقون خيارات البحث</h3>
                <p style="font-size: 0.88rem; color: var(--text-dim); margin-top: 0.5rem;">يمكنك إضافة موظف جديد أو تعديل تصفية البحث.</p>
            </div>
        `;
        return;
    }

    filtered.forEach(emp => {
        const empEvals = state.evaluations.filter(ev => ev.employee_id === emp.id);
        const evalCount = empEvals.length;
        
        let avgRating = 0;
        if (evalCount > 0) {
            const sum = empEvals.reduce((acc, ev) => acc + parseFloat(ev.rating || 0), 0);
            avgRating = (sum / evalCount).toFixed(1);
        }

        const avatar = emp.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(emp.name)}&background=d97706&color=fff`;

        const card = document.createElement('div');
        card.className = 'emp-card';
        card.innerHTML = `
            <div>
                <div class="emp-card-header">
                    <div class="emp-avatar-wrapper">
                        <img src="${avatar}" alt="${emp.name}" class="emp-avatar" onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(emp.name)}&background=d97706&color=fff'">
                        <span class="emp-role-badge">${emp.role}</span>
                    </div>
                    <div class="emp-info">
                        <h3>${emp.name}</h3>
                        <span class="emp-role-text">${emp.role}</span>
                    </div>
                </div>

                <div class="rating-bar-group">
                    <div class="score-badge">
                        <i class="fa-solid fa-star" style="color: #f59e0b;"></i>
                        <span class="score-num">${avgRating > 0 ? avgRating : 'جديد'}</span>
                    </div>
                    <div class="evaluations-count">
                        <i class="fa-solid fa-clipboard-list"></i> ${evalCount} ${evalCount === 1 ? 'تقييم' : 'تقييمات'}
                    </div>
                </div>
            </div>

            <div class="emp-card-footer">
                <button class="btn btn-secondary btn-sm" onclick="openDetailsModal('${emp.id}')">
                    <i class="fa-solid fa-eye"></i> عرض السجل
                </button>
                <button class="btn btn-primary btn-sm" onclick="openEvaluationModal('${emp.id}')">
                    <i class="fa-solid fa-pen"></i> تقييم
                </button>
            </div>
        `;

        grid.appendChild(card);
    });
}

/**
 * Open Head Barista Evaluation Modal
 */
function openEvaluationModal(selectedEmployeeId = null) {
    if (selectedEmployeeId) {
        document.getElementById('evalEmployeeSelect').value = selectedEmployeeId;
    } else {
        document.getElementById('evalEmployeeSelect').value = '';
    }
    
    openModal('evaluationModal');
}

/**
 * Handle New Evaluation Form Submission
 */
async function handleEvaluationSubmit(e) {
    e.preventDefault();

    const employee_id = document.getElementById('evalEmployeeSelect').value;
    const evaluator_name = document.getElementById('evaluatorName').value.trim();
    const evaluation_date = document.getElementById('evaluationDate').value;
    const quality_rating = parseInt(document.getElementById('qualityRating').value);
    const speed_rating = parseInt(document.getElementById('speedRating').value);
    const cleanliness_rating = parseInt(document.getElementById('cleanlinessRating').value);
    const teamwork_rating = parseInt(document.getElementById('teamworkRating').value);
    const notes = document.getElementById('evalNotes').value.trim();

    if (!employee_id) {
        showToast('يرجى اختيار الموظف المراد تقييمه', 'warning');
        return;
    }

    // Calculate Overall Rating average of the 4 criteria
    const avgScore = ((quality_rating + speed_rating + cleanliness_rating + teamwork_rating) / 4).toFixed(2);

    const evalPayload = {
        employee_id,
        evaluator_name,
        evaluation_date,
        quality_rating,
        speed_rating,
        cleanliness_rating,
        teamwork_rating,
        rating: parseFloat(avgScore),
        notes
    };

    try {
        await createEvaluation(evalPayload);
        showToast('تم حفظ التقييم بنجاح!', 'success');
        closeModal('evaluationModal');
        document.getElementById('evaluationForm').reset();
        await refreshAppData();
    } catch (err) {
        showToast('حدث خطأ أثناء حفظ التقييم', 'danger');
    }
}

/**
 * Handle Add Employee Form Submission
 */
async function handleAddEmployeeSubmit(e) {
    e.preventDefault();

    const name = document.getElementById('empName').value.trim();
    const role = document.getElementById('empRole').value;
    const avatar_url = document.getElementById('empAvatar').value.trim();

    if (!name) {
        showToast('يرجى كتابة اسم الموظف', 'warning');
        return;
    }

    const payload = {
        name,
        role,
        avatar_url: avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=d97706&color=fff`
    };

    try {
        await createEmployee(payload);
        showToast('تمت إضافة الموظف بنجاح!', 'success');
        closeModal('addEmployeeModal');
        document.getElementById('addEmployeeForm').reset();
        await refreshAppData();
    } catch (err) {
        showToast('حدث خطأ أثناء إضافة الموظف', 'danger');
    }
}

/**
 * Open Employee Details & Evaluations Modal
 */
function openDetailsModal(empId) {
    const emp = state.employees.find(e => e.id === empId);
    if (!emp) return;

    const empEvals = state.evaluations.filter(ev => ev.employee_id === empId);
    const evalCount = empEvals.length;
    
    let avgRating = 0;
    if (evalCount > 0) {
        const sum = empEvals.reduce((acc, ev) => acc + parseFloat(ev.rating || 0), 0);
        avgRating = (sum / evalCount).toFixed(1);
    }

    const avatar = emp.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(emp.name)}&background=d97706&color=fff`;

    const modalBody = document.getElementById('detailsModalBody');
    
    let evaluationsHtml = '';
    if (evalCount === 0) {
        evaluationsHtml = `
            <div style="text-align: center; padding: 2rem; color: var(--text-dim);">
                <i class="fa-regular fa-clipboard" style="font-size: 2.5rem; margin-bottom: 0.5rem;"></i>
                <p>لا توجد تقييمات مسجلة لهذا الموظف حتى الآن.</p>
            </div>
        `;
    } else {
        evaluationsHtml = empEvals.map(ev => `
            <div class="history-item">
                <div class="history-header">
                    <span class="evaluator"><i class="fa-solid fa-user-shield"></i> المقيّم: ${ev.evaluator_name || 'مسؤول الباريستا'}</span>
                    <span class="date"><i class="fa-solid fa-calendar"></i> تاريخ التقييم: ${ev.evaluation_date}</span>
                </div>
                <div class="history-scores-grid">
                    <div><strong>جودة القهوة:</strong> ${ev.quality_rating || 5}/5 ★</div>
                    <div><strong>السرعة والكفاءة:</strong> ${ev.speed_rating || 5}/5 ★</div>
                    <div><strong>النظافة:</strong> ${ev.cleanliness_rating || 5}/5 ★</div>
                    <div><strong>العمل الجماعي:</strong> ${ev.teamwork_rating || 5}/5 ★</div>
                </div>
                <div style="font-size: 0.9rem; color: var(--accent-gold); margin-bottom: 0.4rem;">
                    <strong>التقييم الإجمالي لهذه الجلسة:</strong> ${ev.rating} / 5.0
                </div>
                ${ev.notes ? `<div style="font-size: 0.88rem; color: var(--text-muted); font-style: italic; background: rgba(0,0,0,0.2); padding: 0.5rem 0.75rem; border-radius: 6px;"><i class="fa-solid fa-quote-right"></i> "${ev.notes}"</div>` : ''}
            </div>
        `).join('');
    }

    modalBody.innerHTML = `
        <div class="employee-profile-summary">
            <img src="${avatar}" class="profile-avatar" alt="${emp.name}">
            <div>
                <h3 style="font-size: 1.3rem; font-weight: 800;">${emp.name}</h3>
                <span class="badge badge-warning" style="margin-top: 0.25rem; display: inline-block;">${emp.role}</span>
                <div style="margin-top: 0.5rem; display: flex; gap: 1.5rem; font-size: 0.9rem; color: var(--text-muted);">
                    <span><strong>معدل التقييم:</strong> <strong style="color: #f59e0b;">${avgRating > 0 ? avgRating + ' ★' : 'لا يوجد'}</strong></span>
                    <span><strong>عدد التقييمات:</strong> <strong>${evalCount}</strong></span>
                </div>
            </div>
        </div>

        <div style="margin-top: 1.5rem;">
            <h4 style="font-size: 1.05rem; font-weight: 700; color: var(--primary-light); margin-bottom: 1rem; border-bottom: 1px solid var(--border-color); padding-bottom: 0.5rem;">
                <i class="fa-solid fa-clock-rotate-left"></i> سجل التقييمات التاريخي (${evalCount})
            </h4>
            <div class="history-timeline">
                ${evaluationsHtml}
            </div>
        </div>
    `;

    openModal('detailsModal');
}

/**
 * Open Supabase Configuration Modal
 */
function openConfigModal() {
    document.getElementById('cfgSupabaseUrl').value = localStorage.getItem(STORAGE_KEYS.SUPABASE_URL) || '';
    document.getElementById('cfgSupabaseKey').value = localStorage.getItem(STORAGE_KEYS.SUPABASE_KEY) || '';
    openModal('configModal');
}

function handleSaveSupabaseConfig() {
    const url = document.getElementById('cfgSupabaseUrl').value.trim();
    const key = document.getElementById('cfgSupabaseKey').value.trim();

    if (!url || !key) {
        showToast('يرجى كتابة URL ومفتاح Anon Key الخاص بـ Supabase', 'warning');
        return;
    }

    localStorage.setItem(STORAGE_KEYS.SUPABASE_URL, url);
    localStorage.setItem(STORAGE_KEYS.SUPABASE_KEY, key);

    closeModal('configModal');
    showToast('تم حفظ بيانات الاتصال بـ Supabase جارِ إعادة الاتصال...', 'success');

    setTimeout(() => {
        window.location.reload();
    }, 1000);
}

function handleClearSupabaseConfig() {
    localStorage.removeItem(STORAGE_KEYS.SUPABASE_URL);
    localStorage.removeItem(STORAGE_KEYS.SUPABASE_KEY);

    closeModal('configModal');
    showToast('تم مسح إعدادات Supabase والعودة للوضع التجريبي المحلي', 'warning');

    setTimeout(() => {
        window.location.reload();
    }, 1000);
}

/**
 * Update Header Badge Connection Indicator
 */
function updateConnectionUI(isConnected) {
    const badge = document.getElementById('connectionBadge');
    const demoBanner = document.getElementById('demoNoticeBanner');

    if (badge) {
        if (isConnected) {
            badge.textContent = 'متصل بـ Supabase';
            badge.className = 'badge badge-success';
            if (demoBanner) demoBanner.style.display = 'none';
        } else {
            badge.textContent = 'تجريبي محلي';
            badge.className = 'badge badge-warning';
        }
    }
}

/**
 * Helper: Modal Open / Close
 */
function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.add('active');
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('active');
}

/**
 * Helper: Toast Notification
 */
function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<i class="fa-solid fa-circle-check"></i> ${message}`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(-20px)';
        toast.style.transition = '0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}
