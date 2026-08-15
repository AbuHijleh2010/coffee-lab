/* ==========================================================================
   COFFEE LAB - SUPABASE & DATA PERSISTENCE SERVICE
   ========================================================================== */

const STORAGE_KEYS = {
    SUPABASE_URL: 'coffeelab_supabase_url',
    SUPABASE_KEY: 'coffeelab_supabase_key',
    DEMO_EMPLOYEES: 'coffeelab_demo_employees_v1',
    DEMO_EVALUATIONS: 'coffeelab_demo_evaluations_v1'
};

let supabaseClient = null;

// Initial Mock Seed Data for instant local demo testing
const INITIAL_DEMO_EMPLOYEES = [
    {
        id: 'emp_1',
        name: 'أحمد القاسم',
        role: 'Senior Barista',
        avatar_url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
        created_at: new Date(Date.now() - 30 * 86400000).toISOString()
    },
    {
        id: 'emp_2',
        name: 'ميار السعيد',
        role: 'Head Barista',
        avatar_url: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80',
        created_at: new Date(Date.now() - 60 * 86400000).toISOString()
    },
    {
        id: 'emp_3',
        name: 'خالد الكردي',
        role: 'Barista',
        avatar_url: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
        created_at: new Date(Date.now() - 15 * 86400000).toISOString()
    },
    {
        id: 'emp_4',
        name: 'لينا سلامة',
        role: 'Junior Barista',
        avatar_url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
        created_at: new Date(Date.now() - 5 * 86400000).toISOString()
    }
];

const INITIAL_DEMO_EVALUATIONS = [
    {
        id: 'eval_1',
        employee_id: 'emp_1',
        evaluator_name: 'ميار السعيد - Head Barista',
        evaluation_date: '2026-08-10',
        quality_rating: 5,
        speed_rating: 4,
        cleanliness_rating: 5,
        teamwork_rating: 5,
        rating: 4.75,
        notes: 'استخلاص ممتاز للـ Espresso وسرعة عالية في التبخير أثناء ساعات الضغط.',
        created_at: new Date('2026-08-10').toISOString()
    },
    {
        id: 'eval_2',
        employee_id: 'emp_1',
        evaluator_name: 'ميار السعيد - Head Barista',
        evaluation_date: '2026-08-01',
        quality_rating: 4,
        speed_rating: 5,
        cleanliness_rating: 4,
        teamwork_rating: 4,
        rating: 4.25,
        notes: 'أداء مستقر وملتزم بنظافة طاحونة الإسبريسو بشكل رائع.',
        created_at: new Date('2026-08-01').toISOString()
    },
    {
        id: 'eval_3',
        employee_id: 'emp_3',
        evaluator_name: 'ميار السعيد - Head Barista',
        evaluation_date: '2026-08-14',
        quality_rating: 4,
        speed_rating: 3,
        cleanliness_rating: 5,
        teamwork_rating: 4,
        rating: 4.0,
        notes: 'تحسن ملحوظ في الرسم على القهوة (Latte Art) يحتاج تسريع وتيرة العمل في الشفت المسائي.',
        created_at: new Date('2026-08-14').toISOString()
    }
];

/**
 * Initialize Supabase Client or Local Demo Store
 */
function initSupabaseService() {
    const url = localStorage.getItem(STORAGE_KEYS.SUPABASE_URL);
    const key = localStorage.getItem(STORAGE_KEYS.SUPABASE_KEY);

    if (url && key && window.supabase) {
        try {
            supabaseClient = window.supabase.createClient(url, key);
            console.log('✅ Supabase connected successfully');
            return true;
        } catch (err) {
            console.error('⚠️ Supabase connection error:', err);
            supabaseClient = null;
        }
    }
    
    // Seed local demo if not present
    if (!localStorage.getItem(STORAGE_KEYS.DEMO_EMPLOYEES)) {
        localStorage.setItem(STORAGE_KEYS.DEMO_EMPLOYEES, JSON.stringify(INITIAL_DEMO_EMPLOYEES));
    }
    if (!localStorage.getItem(STORAGE_KEYS.DEMO_EVALUATIONS)) {
        localStorage.setItem(STORAGE_KEYS.DEMO_EVALUATIONS, JSON.stringify(INITIAL_DEMO_EVALUATIONS));
    }

    return false;
}

/**
 * Check Connection Status
 */
function isSupabaseConnected() {
    return supabaseClient !== null;
}

/**
 * Fetch all employees
 */
/**
 * Fetch all employees (Combines local storage and Supabase)
 */
async function fetchEmployees() {
    let localEmps = [];
    try {
        const raw = localStorage.getItem(STORAGE_KEYS.DEMO_EMPLOYEES);
        localEmps = raw ? JSON.parse(raw) : INITIAL_DEMO_EMPLOYEES;
    } catch (e) {
        localEmps = INITIAL_DEMO_EMPLOYEES;
    }

    if (isSupabaseConnected()) {
        try {
            const { data, error } = await supabaseClient
                .from('employees')
                .select('*')
                .order('created_at', { ascending: false });
            if (!error && data && data.length > 0) {
                const mergedMap = new Map();
                localEmps.forEach(e => mergedMap.set(e.id || e.name, e));
                data.forEach(e => mergedMap.set(e.id || e.name, e));
                return Array.from(mergedMap.values());
            }
        } catch (e) {
            console.warn('Supabase fetch employees error, using local fallback:', e);
        }
    }

    return localEmps;
}

/**
 * Add a new employee (Guaranteed instant save)
 */
async function createEmployee(employeeData) {
    const newEmp = {
        id: 'emp_' + Date.now(),
        ...employeeData,
        created_at: new Date().toISOString()
    };

    // Save locally first for 100% instant UI rendering
    try {
        const current = JSON.parse(localStorage.getItem(STORAGE_KEYS.DEMO_EMPLOYEES) || JSON.stringify(INITIAL_DEMO_EMPLOYEES));
        current.unshift(newEmp);
        localStorage.setItem(STORAGE_KEYS.DEMO_EMPLOYEES, JSON.stringify(current));
    } catch (err) {
        console.error('Error saving to localStorage:', err);
    }

    // Also attempt background sync to Supabase if connected
    if (isSupabaseConnected()) {
        try {
            await supabaseClient.from('employees').insert([employeeData]);
        } catch (e) {
            console.warn('Supabase insert warning (local copy preserved):', e);
        }
    }

    return newEmp;
}

/**
 * Fetch all evaluations (Combines local storage and Supabase)
 */
async function fetchEvaluations() {
    let localEvals = [];
    try {
        const raw = localStorage.getItem(STORAGE_KEYS.DEMO_EVALUATIONS);
        localEvals = raw ? JSON.parse(raw) : INITIAL_DEMO_EVALUATIONS;
    } catch (e) {
        localEvals = INITIAL_DEMO_EVALUATIONS;
    }

    if (isSupabaseConnected()) {
        try {
            const { data, error } = await supabaseClient
                .from('evaluations')
                .select('*')
                .order('evaluation_date', { ascending: false });
            if (!error && data && data.length > 0) {
                const mergedMap = new Map();
                localEvals.forEach(ev => mergedMap.set(ev.id, ev));
                data.forEach(ev => mergedMap.set(ev.id, ev));
                return Array.from(mergedMap.values());
            }
        } catch (e) {
            console.warn('Supabase fetch evaluations error, using local fallback:', e);
        }
    }

    return localEvals;
}

/**
 * Save new evaluation (Guaranteed instant save)
 */
async function createEvaluation(evalData) {
    const newEval = {
        id: 'eval_' + Date.now(),
        ...evalData,
        created_at: new Date().toISOString()
    };

    // Save locally first for 100% instant UI rendering
    try {
        const current = JSON.parse(localStorage.getItem(STORAGE_KEYS.DEMO_EVALUATIONS) || JSON.stringify(INITIAL_DEMO_EVALUATIONS));
        current.unshift(newEval);
        localStorage.setItem(STORAGE_KEYS.DEMO_EVALUATIONS, JSON.stringify(current));
    } catch (err) {
        console.error('Error saving evaluation to localStorage:', err);
    }

    // Also attempt background sync to Supabase if connected
    if (isSupabaseConnected()) {
        try {
            await supabaseClient.from('evaluations').insert([evalData]);
        } catch (e) {
            console.warn('Supabase evaluation insert warning (local copy preserved):', e);
        }
    }

    return newEval;
}
