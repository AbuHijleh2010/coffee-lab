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
async function fetchEmployees() {
    if (isSupabaseConnected()) {
        try {
            const { data, error } = await supabaseClient
                .from('employees')
                .select('*')
                .order('created_at', { ascending: false });
            if (error) throw error;
            return data;
        } catch (e) {
            console.error('Supabase error, falling back to local demo:', e);
        }
    }
    
    // Local fallback
    const raw = localStorage.getItem(STORAGE_KEYS.DEMO_EMPLOYEES);
    return raw ? JSON.parse(raw) : INITIAL_DEMO_EMPLOYEES;
}

/**
 * Add a new employee
 */
async function createEmployee(employeeData) {
    if (isSupabaseConnected()) {
        try {
            const { data, error } = await supabaseClient
                .from('employees')
                .insert([employeeData])
                .select();
            if (error) throw error;
            if (data && data.length > 0) return data[0];
        } catch (e) {
            console.warn('Supabase error creating employee, saving locally fallback:', e);
        }
    }

    // Local fallback
    const current = JSON.parse(localStorage.getItem(STORAGE_KEYS.DEMO_EMPLOYEES) || JSON.stringify(INITIAL_DEMO_EMPLOYEES));
    const newEmp = {
        id: 'emp_' + Date.now(),
        ...employeeData,
        created_at: new Date().toISOString()
    };
    current.unshift(newEmp);
    localStorage.setItem(STORAGE_KEYS.DEMO_EMPLOYEES, JSON.stringify(current));
    return newEmp;
}

/**
 * Fetch all evaluations
 */
async function fetchEvaluations() {
    if (isSupabaseConnected()) {
        try {
            const { data, error } = await supabaseClient
                .from('evaluations')
                .select('*')
                .order('evaluation_date', { ascending: false });
            if (error) throw error;
            if (data) return data;
        } catch (e) {
            console.warn('Supabase error fetching evaluations, falling back to local storage:', e);
        }
    }

    // Local fallback
    const raw = localStorage.getItem(STORAGE_KEYS.DEMO_EVALUATIONS);
    return raw ? JSON.parse(raw) : INITIAL_DEMO_EVALUATIONS;
}

/**
 * Save new evaluation
 */
async function createEvaluation(evalData) {
    if (isSupabaseConnected()) {
        try {
            const { data, error } = await supabaseClient
                .from('evaluations')
                .insert([evalData])
                .select();
            if (error) throw error;
            if (data && data.length > 0) return data[0];
        } catch (e) {
            console.warn('Supabase error creating evaluation, saving locally fallback:', e);
        }
    }

    // Local fallback
    const current = JSON.parse(localStorage.getItem(STORAGE_KEYS.DEMO_EVALUATIONS) || JSON.stringify(INITIAL_DEMO_EVALUATIONS));
    const newEval = {
        id: 'eval_' + Date.now(),
        ...evalData,
        created_at: new Date().toISOString()
    };
    current.unshift(newEval);
    localStorage.setItem(STORAGE_KEYS.DEMO_EVALUATIONS, JSON.stringify(current));
    return newEval;
}
