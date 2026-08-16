/* ==========================================================================
   COFFEE LAB - APPLICATION UI & CONTROLLER LOGIC
   ========================================================================== */

let state = {
    employees: [],
    evaluations: [],
    filterSearch: '',
    filterRole: 'all',
    currentAdmin: sessionStorage.getItem('coffeelab_admin_user') || null,
    pendingAction: null,
    editingEvalId: null,
    editingEmpId: null,
    currentEquipmentStatuses: {}
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

        // 3. Update Auth Widget Status
        updateAuthUI();

        // 4. Register Event Listeners
        setupEventListeners();
    } catch (err) {
        console.warn('Initialization warning:', err);
    }

    // 5. Load Data & Render (Guaranteed Execution)
    await refreshAppData();
});

/**
 * Head Barista / Admin Auth Controller
 */
function updateAuthUI() {
    const container = document.getElementById('authStatusWidget');
    if (!container) return;

    if (state.currentAdmin) {
        container.innerHTML = `
            <div class="admin-logged-badge">
                <span class="badge-admin-name"><i class="fa-solid fa-user-check"></i> الهيد بار: <strong>${state.currentAdmin}</strong></span>
                <button type="button" class="btn btn-outline btn-xs" onclick="handleLogout()" title="تسجيل الخروج">
                    <i class="fa-solid fa-right-from-bracket"></i> خروج
                </button>
            </div>
        `;
        const evalInput = document.getElementById('evaluatorName');
        if (evalInput && !evalInput.value) {
            evalInput.value = state.currentAdmin;
        }
    } else {
        container.innerHTML = `
            <button class="btn btn-outline" onclick="openLoginModal()">
                <i class="fa-solid fa-user-lock"></i>
                <span>دخول الهيد بار (المسؤول)</span>
            </button>
        `;
    }
}

function openLoginModal() {
    openModal('loginModal');
}

function requireAdminAuth(callbackAction) {
    if (state.currentAdmin) {
        callbackAction();
    } else {
        state.pendingAction = callbackAction;
        showToast('يرجى تسجيل دخول الهيد بار أولاً للقيام بهذا الإجراء', 'warning');
        openLoginModal();
    }
}

function handleLoginSubmit(e) {
    e.preventDefault();

    const username = document.getElementById('adminUsername').value.trim();
    const pin = document.getElementById('adminPin').value.trim();

    if (!username) {
        showToast('يرجى كتابة اسم المستخدم أو الهيد بار', 'warning');
        return;
    }

    if (pin !== 'lab123') {
        showToast('كلمة المرور السرية غير صحيحة!', 'danger');
        return;
    }

    state.currentAdmin = username;
    sessionStorage.setItem('coffeelab_admin_user', username);
    showToast(`أهلاً بك ${username}! تم تسجيل دخول الهيد بار بنجاح.`, 'success');
    closeModal('loginModal');
    document.getElementById('loginForm').reset();
    updateAuthUI();

    if (typeof state.pendingAction === 'function') {
        const action = state.pendingAction;
        state.pendingAction = null;
        action();
    }
}

function handleLogout() {
    state.currentAdmin = null;
    sessionStorage.removeItem('coffeelab_admin_user');
    showToast('تم تسجيل الخروج من حساب الهيد بار بنجاح', 'warning');
    updateAuthUI();
}

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
            <div style="grid-column: 1 / -1; text-align: center; padding: 3.5rem 1.5rem; background: var(--bg-card); border-radius: var(--radius-lg); border: 1px dashed var(--border-color); backdrop-filter: blur(16px);">
                <i class="fa-solid fa-mug-hot" style="font-size: 3.2rem; color: var(--primary-gold); margin-bottom: 1rem; display: block;"></i>
                <h3 style="color: #ffffff; font-weight: 800; font-size: 1.3rem;">لا يوجد موظفون حالياً في قائمة Coffee Lab</h3>
                <p style="font-size: 0.9rem; color: var(--text-muted); margin-top: 0.5rem; margin-bottom: 1.5rem;">ابدأ العمل مباشرة بإضافة أعضاء فريق الباريستا الحقيقيين للبدء بتسجيل التقييمات.</p>
                <button class="btn btn-primary" onclick="openModal('addEmployeeModal')">
                    <i class="fa-solid fa-user-plus"></i> إضافة أول موظف الآن
                </button>
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
                    <i class="fa-solid fa-eye"></i> السجل
                </button>
                <button class="btn btn-primary btn-sm" onclick="requireAdminAuth(() => openEvaluationModal('${emp.id}'))">
                    <i class="fa-solid fa-pen"></i> تقييم
                </button>
                <button class="btn btn-outline btn-sm" title="تعديل ملف الموظف" onclick="requireAdminAuth(() => openEditEmployeeModal('${emp.id}'))">
                    <i class="fa-solid fa-user-pen"></i>
                </button>
                <button class="btn btn-danger-icon btn-sm" title="حذف الموظف" onclick="requireAdminAuth(() => handleDeleteEmployeePrompt('${emp.id}', '${emp.name.replace(/'/g, "\\'")}'))">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            </div>
        `;

        grid.appendChild(card);
    });
}

/**
 * Handle Delete Employee Confirmation Prompt
 */
async function handleDeleteEmployeePrompt(empId, empName) {
    if (confirm(`هل أنت تأكد من إزالة الموظف "${empName}" من فريق Coffee Lab؟\n(سيتم إزالة تفاصيل وتاريخ تقييماته تلقائياً)`)) {
        await deleteEmployee(empId);
        showToast(`تم حذف الموظف ${empName} بنجاح`, 'warning');
        await refreshAppData();
    }
}

/**
 * Handle Delete All Employees Confirmation Prompt
 */
async function handleDeleteAllPrompt() {
    if (confirm('هل أنت تأكد من حذف جميع الموظفين والتقييمات والبدء بقائمة نظيفة 0؟')) {
        await deleteAllEmployees();
        showToast('تم مسح جميع الموظفين والبدء بقائمة جديدة بنجاح!', 'warning');
        await refreshAppData();
    }
}

/**
 * Open Head Barista Evaluation Modal
 */
// Head Barista Dynamic Checklists & Station-Specific Criteria Data Structure
const STATION_CHECKLISTS = {
    cold: {
        title: '🧊 فحص وتفتيش أجهزة ومعدات بار البارد (Cold Bar Equipment Status)',
        items: [
            { id: 'item_ice_coffee_reg', text: 'ماكينة الآيس كوفي العادي', icon: 'fa-glass-water', type: '3state' },
            { id: 'item_ice_coffee_diet', text: 'ماكينة آيس كوفي الدايت', icon: 'fa-bottle-water', type: '3state' },
            { id: 'item_freezer_ice_cream', text: 'فريزر الفروزن والبوظة', icon: 'fa-snowflake', type: '2state' },
            { id: 'item_syrups_purees', text: 'منطقة السيربات والبيوريهات', icon: 'fa-bottle-droplet', type: '2state' },
            { id: 'item_drizzles_sauces', text: 'منطقة الدرزلات والصلصات', icon: 'fa-wine-bottle', type: '2state' },
            { id: 'item_fridge_mixes', text: 'ثلاجة الحليب والخلطات الباردة (FIFO وتاريخ الفتح)', icon: 'fa-temperature-arrow-down', type: '2state' }
        ],
        criteriaLabels: {
            c1_title: '<i class="fa-solid fa-snowflake"></i> التزام بريسبي المشروبات الباردة والشيقر',
            c1_desc: 'المعايير، الشيك، الميزان ونظافة الكاسات الباردة',
            c2_title: '<i class="fa-solid fa-stopwatch"></i> سرعة التحضير وتدفق أوردرات البارد',
            c2_desc: 'سرعة إنجاز العصائر والآيس لاتيه وتنسيق الطلبات',
            c3_title: '<i class="fa-solid fa-broom"></i> نظافة أجهزة البارد والثلاجات ومواعيد FIFO',
            c3_desc: 'نظافة الخلاطات وتوثيق تاريخ الفتح على الحليب والخلطات',
            c4_title: '<i class="fa-solid fa-handshake"></i> الانضباط والعمل الجماعي بالبار البارد',
            c4_desc: 'التعاون مع فريق البار والتزام التوجيهات'
        }
    },
    espresso: {
        title: '☕ فحص وتفتيش أجهزة ومعدات بار الإسبريسو (Espresso Bar Equipment Status)',
        items: [
            { id: 'item_esp_machine', text: 'ماكينة الإسبريسو والجروب هيدز', icon: 'fa-mug-saucer', type: '3state' },
            { id: 'item_steam_wands', text: 'ستيمارات التبخير والنظافة', icon: 'fa-wand-magic-sparkles', type: '2state' },
            { id: 'item_grinder_portafilters', text: 'طاحونة القهوة والبورتافلترات والمعايرة', icon: 'fa-gear', type: '2state' },
            { id: 'item_under_fridge', text: 'ثلاجة الحليب السفلية وترتيب FIFO', icon: 'fa-temperature-low', type: '2state' },
            { id: 'item_pitchers_area', text: 'منطقة التبخير والبتشرات ونظافتها', icon: 'fa-droplet', type: '2state' }
        ],
        criteriaLabels: {
            c1_title: '<i class="fa-solid fa-coffee"></i> الجودة والاستخلاص والتبخير والرسم',
            c1_desc: 'درجة الطحن، الاستخلاص الصحيح، درجة حرارة التبخير والرسم',
            c2_title: '<i class="fa-solid fa-stopwatch"></i> السرعة والالتزام بالريسبي والميزان',
            c2_desc: 'استخدام الميزان والسرعة في تحضير شوتات الإسبريسو',
            c3_title: '<i class="fa-solid fa-broom"></i> نظافة ماكينة الإسبريسو وتاريخ فتح الحليب النباتي',
            c3_desc: 'نظافة الأجهزة والثلاجة السفلية وتوثيق تاريخ الفتح',
            c4_title: '<i class="fa-solid fa-handshake"></i> الانضباط والعمل الجماعي بالبار',
            c4_desc: 'الالتزام بتوجيهات الهيد بار والتعاون مع فريق الشفت'
        }
    },
    assistant: {
        title: '🥛 فحص وتفتيش مواكن وتجهيزات مساعد البار (Bar Assistant Equipment Status)',
        items: [
            { id: 'item_iced_tea_mac', text: 'ماكينة الآيس تي', icon: 'fa-mug-hot', type: '3state' },
            { id: 'item_miss_flora_mac', name: 'ماكينة الميس فلورا', icon: 'fa-seedling', type: '3state' },
            { id: 'item_spanish_vanilla_mac', text: 'ماكينة السبانش والآيس فانيلا', icon: 'fa-bottle-water', type: '3state' },
            { id: 'item_shakers_scale', text: 'الشيقرات والبتشرات والميزان', icon: 'fa-scale-unbalanced', type: '2state' },
            { id: 'item_prep_table_mixes', text: 'طاولة التجهيز والخلطات المسبقة FIFO', icon: 'fa-layer-group', type: '2state' }
        ],
        criteriaLabels: {
            c1_title: '<i class="fa-solid fa-flask"></i> دقة تجهيز الخلطات والسيربات',
            c1_desc: 'معايرة الخلطات المسبقة بدقة والالتزام بالريسبي المعياري',
            c2_title: '<i class="fa-solid fa-bolt"></i> السرعة والدعم الفعال لبار الإسبريسو والبارد',
            c2_desc: 'سرعة توفير احتياجات البار وتلبية الأوردرات',
            c3_title: '<i class="fa-solid fa-broom"></i> نظافة منطقة التحضير والبتشرات وتاريخ الفتح',
            c3_desc: 'نظافة المواكن وطاولة التحضير وتوثيق FIFO',
            c4_title: '<i class="fa-solid fa-handshake"></i> الانضباط والتعاون والتواصل الجيد',
            c4_desc: 'الالتزام بتوجيهات الشفت والتعاون الكامل مع الفريق'
        }
    }
};

/**
 * Update Individual Equipment Item Status Pill
 */
function setItemStatus(itemId, statusVal) {
    state.currentEquipmentStatuses[itemId] = statusVal;

    // Update UI active states for pill group
    const group = document.querySelector(`.status-pill-group[data-item-id="${itemId}"]`);
    if (group) {
        group.querySelectorAll('.btn-status-pill').forEach(btn => {
            btn.classList.remove('active');
        });
        const activeBtn = group.querySelector(`.btn-status-pill.pill-${statusVal}`);
        if (activeBtn) activeBtn.classList.add('active');
    }
}

/**
 * Render Dynamic Station Equipment Status Cards & Station Specific Criteria
 */
function renderStationChecklist() {
    const stationSelect = document.getElementById('barStation');
    const container = document.getElementById('stationChecklistContainer');
    if (!stationSelect || !container) return;

    const stationKey = stationSelect.value || 'cold';
    const config = STATION_CHECKLISTS[stationKey];
    if (!config) return;

    // 1. Update criteria labels according to station
    const cLabels = config.criteriaLabels;
    if (cLabels) {
        const c1T = document.getElementById('lblQualityTitle');
        const c1D = document.getElementById('lblQualityDesc');
        const c2T = document.getElementById('lblSpeedTitle');
        const c2D = document.getElementById('lblSpeedDesc');
        const c3T = document.getElementById('lblCleanTitle');
        const c3D = document.getElementById('lblCleanDesc');
        const c4T = document.getElementById('lblTeamTitle');
        const c4D = document.getElementById('lblTeamDesc');

        if (c1T) c1T.innerHTML = cLabels.c1_title;
        if (c1D) c1D.textContent = cLabels.c1_desc;
        if (c2T) c2T.innerHTML = cLabels.c2_title;
        if (c2D) c2D.textContent = cLabels.c2_desc;
        if (c3T) c3T.innerHTML = cLabels.c3_title;
        if (c3D) c3D.textContent = cLabels.c3_desc;
        if (c4T) c4T.innerHTML = cLabels.c4_title;
        if (c4D) c4D.textContent = cLabels.c4_desc;
    }

    // 2. Render equipment cards with 3-State or 2-State pills
    container.innerHTML = `
        <div class="checklist-card">
            <h4><i class="fa-solid fa-list-check"></i> ${config.title}:</h4>
            <div style="display: flex; flex-direction: column; gap: 0.75rem; margin-top: 0.85rem;">
                ${config.items.map(item => {
                    const currentStatus = state.currentEquipmentStatuses[item.id] || 'clean';
                    return `
                        <div class="equipment-status-card">
                            <div class="equipment-header">
                                <div class="equipment-title">
                                    <i class="fa-solid ${item.icon}"></i> ${item.text || item.name}
                                </div>
                            </div>
                            <div class="status-pill-group" data-item-id="${item.id}">
                                <button type="button" class="btn-status-pill pill-clean ${currentStatus === 'clean' ? 'active' : ''}" onclick="setItemStatus('${item.id}', 'clean')">
                                    <i class="fa-solid fa-circle-check"></i> 🟢 نظيفة / مرتبة
                                </button>
                                ${item.type === '3state' ? `
                                    <button type="button" class="btn-status-pill pill-foam ${currentStatus === 'foam' ? 'active' : ''}" onclick="setItemStatus('${item.id}', 'foam')">
                                        <i class="fa-solid fa-soap"></i> 🟡 بدها فوم / تعبئة
                                    </button>
                                ` : ''}
                                <button type="button" class="btn-status-pill pill-dirty ${currentStatus === 'dirty' ? 'active' : ''}" onclick="setItemStatus('${item.id}', 'dirty')">
                                    <i class="fa-solid fa-circle-xmark"></i> 🔴 وسخة / بحاجة تنظيف
                                </button>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
    `;
}

/**
 * Open Head Barista Evaluation Modal (Create or Edit)
 */
function openEvaluationModal(selectedEmployeeId = null, evalToEdit = null) {
    const modalTitle = document.getElementById('evalModalTitle');
    
    if (evalToEdit) {
        state.editingEvalId = evalToEdit.id;
        state.currentEquipmentStatuses = evalToEdit.equipment_statuses ? 
            evalToEdit.equipment_statuses.reduce((acc, curr) => { acc[curr.id] = curr.status; return acc; }, {}) : {};

        if (modalTitle) modalTitle.innerHTML = '<i class="fa-solid fa-pen-to-square"></i> تعديل تقرير تقييم الموظف';

        document.getElementById('evalEmployeeSelect').value = evalToEdit.employee_id;
        document.getElementById('evaluatorName').value = evalToEdit.evaluator_name || state.currentAdmin || '';
        document.getElementById('evaluationDate').value = evalToEdit.evaluation_date;
        document.getElementById('shiftType').value = evalToEdit.shift_type || 'صباحي';
        document.getElementById('barStation').value = evalToEdit.bar_station || 'cold';

        document.getElementById('quizDrinkName').value = evalToEdit.quiz_drink_name || '';
        document.getElementById('quizRating').value = evalToEdit.quiz_rating || 5;

        document.getElementById('qualityRating').value = evalToEdit.quality_rating || 5;
        document.getElementById('speedRating').value = evalToEdit.speed_rating || 5;
        document.getElementById('cleanlinessRating').value = evalToEdit.cleanliness_rating || 5;
        document.getElementById('teamworkRating').value = evalToEdit.teamwork_rating || 5;

        document.getElementById('apronUniformStatus').value = evalToEdit.apronUniformStatus || 'نظيف ومرتب بالكامل';
        document.getElementById('hygieneNailsStatus').value = evalToEdit.hygieneNailsStatus || 'ممتاز وملتزم بالكامل';
        document.getElementById('groomingRating').value = evalToEdit.grooming_rating || 5;

        document.getElementById('arrivalTime').value = evalToEdit.arrivalTime || '';
        document.getElementById('attendanceStatus').value = evalToEdit.attendanceStatus || 'على الوقت بالدقيقة / مبكر';
        document.getElementById('attendanceRating').value = evalToEdit.attendance_rating || 5;

        document.getElementById('evalMistakes').value = evalToEdit.evalMistakes || '';
        document.getElementById('evalNotes').value = evalToEdit.notes || '';

        renderStationChecklist();
    } else {
        state.editingEvalId = null;
        state.currentEquipmentStatuses = {};
        if (modalTitle) modalTitle.innerHTML = '<i class="fa-solid fa-pen-to-square"></i> نموذج تقييم موظف (الهيد بار / المسؤول)';
        
        document.getElementById('evaluationForm').reset();
        if (selectedEmployeeId) {
            document.getElementById('evalEmployeeSelect').value = selectedEmployeeId;
        } else {
            document.getElementById('evalEmployeeSelect').value = '';
        }
        document.getElementById('evaluatorName').value = state.currentAdmin || '';
        document.getElementById('evaluationDate').value = new Date().toISOString().split('T')[0];
        document.getElementById('barStation').value = 'cold';
        renderStationChecklist();
    }
    
    openModal('evaluationModal');
}

/**
 * Handle Evaluation Form Submission (Create or Edit)
 */
async function handleEvaluationSubmit(e) {
    e.preventDefault();

    const employee_id = document.getElementById('evalEmployeeSelect').value;
    const evaluator_name = document.getElementById('evaluatorName').value.trim();
    const evaluation_date = document.getElementById('evaluationDate').value;
    const shift_type = document.getElementById('shiftType').value;
    const bar_station = document.getElementById('barStation').value;

    const quiz_drink_name = document.getElementById('quizDrinkName').value.trim();
    const quiz_rating = parseInt(document.getElementById('quizRating').value || '5');

    const quality_rating = parseInt(document.getElementById('qualityRating').value || '5');
    const speed_rating = parseInt(document.getElementById('speedRating').value || '5');
    const cleanliness_rating = parseInt(document.getElementById('cleanlinessRating').value || '5');
    const teamwork_rating = parseInt(document.getElementById('teamworkRating').value || '5');

    const apronUniformStatus = document.getElementById('apronUniformStatus').value;
    const hygieneNailsStatus = document.getElementById('hygieneNailsStatus').value;
    const grooming_rating = parseInt(document.getElementById('groomingRating').value || '5');

    const arrivalTime = document.getElementById('arrivalTime').value;
    const attendanceStatus = document.getElementById('attendanceStatus').value;
    const attendance_rating = parseInt(document.getElementById('attendanceRating').value || '5');

    const evalMistakes = document.getElementById('evalMistakes').value.trim();
    const notes = document.getElementById('evalNotes').value.trim();

    if (!employee_id) {
        showToast('يرجى اختيار الموظف المراد تقييمه', 'warning');
        return;
    }

    // Collect 3-State Equipment Statuses
    const currentStationConfig = STATION_CHECKLISTS[bar_station];
    const equipment_statuses = [];
    if (currentStationConfig) {
        currentStationConfig.items.forEach(item => {
            const st = state.currentEquipmentStatuses[item.id] || 'clean';
            equipment_statuses.push({
                id: item.id,
                name: item.text || item.name,
                status: st
            });
        });
    }

    // Calculate Overall Rating average of 6 criteria + quiz (7 total)
    const avgScore = ((quality_rating + speed_rating + cleanliness_rating + teamwork_rating + quiz_rating + grooming_rating + attendance_rating) / 7).toFixed(2);

    const evalPayload = {
        employee_id,
        evaluator_name,
        evaluation_date,
        shift_type,
        bar_station,
        quiz_drink_name,
        quiz_rating,
        quality_rating,
        speed_rating,
        cleanliness_rating,
        teamwork_rating,
        apronUniformStatus,
        hygieneNailsStatus,
        grooming_rating,
        arrivalTime,
        attendanceStatus,
        attendance_rating,
        rating: parseFloat(avgScore),
        equipment_statuses,
        evalMistakes,
        notes
    };

    try {
        if (state.editingEvalId) {
            await updateEvaluation(state.editingEvalId, evalPayload);
            showToast('تم تعديل التقييم بنجاح!', 'success');
            state.editingEvalId = null;
        } else {
            await createEvaluation(evalPayload);
            showToast('تم حفظ تقرير التقييم بنجاح!', 'success');
        }
        closeModal('evaluationModal');
        document.getElementById('evaluationForm').reset();
        await refreshAppData();
    } catch (err) {
        showToast('حدث خطأ أثناء حفظ التقييم', 'danger');
    }
}

/**
 * Handle Single Evaluation Deletion Prompt
 */
async function handleDeleteSingleEvalPrompt(evalId, empId) {
    requireAdminAuth(async () => {
        if (confirm('هل أنت تأكد من حذف هذا التقييم المحدد نهائياً؟')) {
            await deleteSingleEvaluation(evalId);
            showToast('تم حذف التقييم بنجاح', 'warning');
            await refreshAppData();
            openDetailsModal(empId);
        }
    });
}

/**
 * Handle Single Evaluation Edit Prompt
 */
function handleEditSingleEvalPrompt(evalId) {
    requireAdminAuth(() => {
        const ev = state.evaluations.find(item => item.id === evalId);
        if (ev) {
            closeModal('detailsModal');
            openEvaluationModal(ev.employee_id, ev);
        }
    });
}

/**
 * Select Preset Avatar URL
 */
function selectPresetAvatar(url) {
    const avatarInput = document.getElementById('empAvatar');
    if (avatarInput) {
        avatarInput.value = url;
        showToast('تم اختيار الصورة الرمزية بنجاح', 'info');
    }
}

/**
 * Handle Local File Upload for Avatar
 */
function handleAvatarFileSelect(e) {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(evt) {
            const avatarInput = document.getElementById('empAvatar');
            if (avatarInput) {
                avatarInput.value = evt.target.result;
                showToast('تم تحميل الصورة من جهازك بنجاح!', 'success');
            }
        };
        reader.readAsDataURL(file);
    }
}

/**
 * Open Add Employee Modal
 */
function openAddEmployeeModal() {
    state.editingEmpId = null;
    document.getElementById('addEmployeeForm').reset();
    const title = document.getElementById('addEmpModalTitle');
    const btn = document.getElementById('btnSubmitEmp');
    if (title) title.innerHTML = '<i class="fa-solid fa-user-plus"></i> إضافة موظف جديد لـ Coffee Lab';
    if (btn) btn.innerHTML = '<i class="fa-solid fa-check"></i> إضافة الموظف';
    openModal('addEmployeeModal');
}

/**
 * Open Edit Employee Profile Modal
 */
function openEditEmployeeModal(empId) {
    const emp = state.employees.find(e => e.id === empId);
    if (!emp) return;

    state.editingEmpId = emp.id;
    const title = document.getElementById('addEmpModalTitle');
    const btn = document.getElementById('btnSubmitEmp');
    if (title) title.innerHTML = '<i class="fa-solid fa-user-pen"></i> تعديل بروفايل الموظف';
    if (btn) btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> حفظ التعديلات';

    document.getElementById('empName').value = emp.name || '';
    document.getElementById('empRole').value = emp.role || 'Barista';
    document.getElementById('empAvatar').value = emp.avatar_url && !emp.avatar_url.includes('ui-avatars.com') ? emp.avatar_url : '';

    openModal('addEmployeeModal');
}

/**
 * Handle Add or Edit Employee Form Submission
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
        if (state.editingEmpId) {
            await updateEmployee(state.editingEmpId, payload);
            showToast(`تم تعديل بروفايل الموظف "${name}" بنجاح!`, 'success');
            state.editingEmpId = null;
        } else {
            await createEmployee(payload);
            showToast('تمت إضافة الموظف بنجاح!', 'success');
        }
        closeModal('addEmployeeModal');
        document.getElementById('addEmployeeForm').reset();
        await refreshAppData();
    } catch (err) {
        showToast('حدث خطأ أثناء حفظ بيانات الموظف', 'danger');
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
        evaluationsHtml = empEvals.map(ev => {
            const stationTitle = ev.bar_station === 'espresso' ? '☕ بار الإسبريسو' :
                                 ev.bar_station === 'assistant' ? '🥛 مساعد البار' : '🧊 بار المشروبات الباردة';
            return `
                <div class="history-item">
                    <div class="history-header">
                        <div>
                            <span class="evaluator"><i class="fa-solid fa-user-shield"></i> الهيد بار: ${ev.evaluator_name || 'مسؤول الباريستا'}</span>
                            <span class="date" style="margin-right: 0.75rem;"><i class="fa-solid fa-calendar"></i> ${ev.evaluation_date} (${ev.shift_type || 'شفت عالي'})</span>
                        </div>
                        <div style="display: flex; gap: 0.4rem;">
                            <button type="button" class="btn btn-secondary btn-xs" onclick="handleEditSingleEvalPrompt('${ev.id}')" title="تعديل هذا التقييم">
                                <i class="fa-solid fa-pen-to-square"></i> تعديل
                            </button>
                            <button type="button" class="btn btn-danger-icon btn-xs" onclick="handleDeleteSingleEvalPrompt('${ev.id}', '${empId}')" title="حذف هذا التقييم">
                                <i class="fa-solid fa-trash-can"></i>
                            </button>
                        </div>
                    </div>

                    <div style="display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 0.75rem;">
                        <div class="station-badge-tag">
                            <i class="fa-solid fa-mug-saucer"></i> ${stationTitle}
                        </div>
                        ${ev.arrivalTime ? `
                            <div class="station-badge-tag" style="background: rgba(56, 189, 248, 0.15); color: #38bdf8; border-color: rgba(56, 189, 248, 0.3);">
                                <i class="fa-solid fa-clock"></i> الوصول: ${ev.arrivalTime} (${ev.attendanceStatus || 'على الوقت'})
                            </div>
                        ` : ''}
                    </div>

                    ${ev.quiz_drink_name ? `
                        <div class="quiz-box">
                            <div><strong><i class="fa-solid fa-clipboard-question"></i> اختبار الريسبي الشفهي:</strong> ${ev.quiz_drink_name}</div>
                            <div><strong>الدرجة:</strong> ${ev.quiz_rating || 5}/5 ★</div>
                        </div>
                    ` : ''}

                    <div class="history-scores-grid" style="margin-top: 0.75rem;">
                        <div><strong>الجودة والاستخلاص:</strong> ${ev.quality_rating || 5}/5 ★</div>
                        <div><strong>السرعة والميزان:</strong> ${ev.speed_rating || 5}/5 ★</div>
                        <div><strong>النظافة والـ FIFO:</strong> ${ev.cleanliness_rating || 5}/5 ★</div>
                        <div><strong>الانضباط والفريق:</strong> ${ev.teamwork_rating || 5}/5 ★</div>
                        <div><strong>المظهر والنظافة الشخصية:</strong> ${ev.grooming_rating || 5}/5 ★</div>
                        <div><strong>الالتزام ومواعيد الشفت:</strong> ${ev.attendance_rating || 5}/5 ★</div>
                    </div>

                    ${ev.apronUniformStatus || ev.hygieneNailsStatus ? `
                        <div class="notes-box" style="border-right-color: #38bdf8; background: rgba(15, 23, 42, 0.5);">
                            <strong><i class="fa-solid fa-shirt"></i> المظهر والزي والجمالية:</strong>
                            <div style="font-size: 0.85rem; margin-top: 0.25rem;">
                                • المريول والزي: ${ev.apronUniformStatus || 'نظيف'}<br>
                                • النظافة والأظافر: ${ev.hygieneNailsStatus || 'ممتاز'}
                            </div>
                        </div>
                    ` : ''}

                    ${ev.equipment_statuses && ev.equipment_statuses.length > 0 ? `
                        <div class="checklist-summary-box">
                            <strong style="color: var(--gold-pure);"><i class="fa-solid fa-list-check"></i> حالة الأجهزة ومعدات المحطة:</strong>
                            <div style="display: flex; flex-direction: column; gap: 0.45rem; margin-top: 0.65rem;">
                                ${ev.equipment_statuses.map(item => {
                                    const stClass = item.status === 'clean' ? 'badge-pill-clean' : item.status === 'foam' ? 'badge-pill-foam' : 'badge-pill-dirty';
                                    const stText = item.status === 'clean' ? '🟢 نظيفة / مرتبة' : item.status === 'foam' ? '🟡 بدها فوم / تعبئة' : '🔴 وسخة / بحاجة تنظيف';
                                    return `
                                        <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(3, 3, 5, 0.6); padding: 0.5rem 0.85rem; border-radius: 8px; border: 1px solid var(--border-color); font-size: 0.88rem;">
                                            <span style="font-weight: 700; color: #ffffff;">${item.name}</span>
                                            <span class="status-badge-pill ${stClass}">${stText}</span>
                                        </div>
                                    `;
                                }).join('')}
                            </div>
                        </div>
                    ` : ev.checklist_results && ev.checklist_results.length > 0 ? `
                        <div class="checklist-summary-box">
                            <strong style="color: var(--gold-pure);"><i class="fa-solid fa-list-check"></i> نتائج نقاط الفحص والتجهيز:</strong>
                            <ul class="checklist-bullets">
                                ${ev.checklist_results.map(c => `
                                    <li class="${c.passed ? 'text-success' : 'text-danger'}">
                                        <i class="${c.passed ? 'fa-solid fa-circle-check' : 'fa-solid fa-circle-xmark'}"></i> ${c.text}
                                    </li>
                                `).join('')}
                            </ul>
                        </div>
                    ` : ''}

                    ${ev.evalMistakes ? `
                        <div class="mistakes-box">
                            <strong><i class="fa-solid fa-triangle-exclamation"></i> سجل الأخطاء والملاحظات الميدانية:</strong>
                            <p style="margin-top: 0.25rem;">${ev.evalMistakes}</p>
                        </div>
                    ` : ''}

                    ${ev.notes ? `
                        <div class="notes-box">
                            <strong><i class="fa-solid fa-comment-dots"></i> توجيهات الهيد بار للتحسين:</strong>
                            <p style="margin-top: 0.25rem; font-style: italic;">"${ev.notes}"</p>
                        </div>
                    ` : ''}

                    <div style="font-size: 0.92rem; color: var(--accent-gold); margin-top: 0.85rem; font-weight: 700; text-align: left;">
                        معدل الجلسة الإجمالي: ${ev.rating} / 5.0 ★
                    </div>
                </div>
            `;
        }).join('');
    }

    modalBody.innerHTML = `
        <div class="employee-profile-summary" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem;">
            <div style="display: flex; gap: 1rem; align-items: center;">
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
            <button type="button" class="btn btn-outline btn-sm" onclick="requireAdminAuth(() => { closeModal('detailsModal'); openEditEmployeeModal('${emp.id}'); })">
                <i class="fa-solid fa-user-pen"></i> تعديل البروفايل
            </button>
        </div>

        <div style="margin-top: 1.5rem;">
            <h4 style="font-size: 1.05rem; font-weight: 700; color: var(--primary-light); margin-bottom: 1rem; border-bottom: 1px solid var(--border-color); padding-bottom: 0.5rem;">
                <i class="fa-solid fa-clock-rotate-left"></i> سجل التقييمات والتقارير التفصيلية (${evalCount})
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
