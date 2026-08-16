/* ==========================================================================
   COFFEE LAB - SUPABASE & DATA PERSISTENCE SERVICE
   ========================================================================== */

const STORAGE_KEYS = {
    SUPABASE_URL: 'coffeelab_supabase_url',
    SUPABASE_KEY: 'coffeelab_supabase_key',
    DEMO_EMPLOYEES: 'coffeelab_demo_employees_v10',
    DEMO_EVALUATIONS: 'coffeelab_demo_evaluations_v10'
};

let supabaseClient = null;

// Initial Seed Data for fresh live visitors (Clean Zero State)
const INITIAL_DEMO_EMPLOYEES = [];
const INITIAL_DEMO_EVALUATIONS = [];

// Helper function to prevent network hangs with a strict 800ms timeout
function withTimeout(promise, ms = 800) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Network timeout')), ms);
        promise.then(
            res => { clearTimeout(timer); resolve(res); },
            err => { clearTimeout(timer); reject(err); }
        );
    });
}

const DEFAULT_SUPABASE_URL = 'https://dpdtnnzwqqejeqvtufbm.supabase.co';
const DEFAULT_SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRwZHRubnp3cXFlamVxdnR1ZmJtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY4MTEyNjUsImV4cCI6MjEwMjM4NzI2NX0.k4BB7nQV6AF0vF1LfzCBWrzhG4_Af4hh3M2-OeNCRMM';

/**
 * Initialize Local Store & Default Supabase Cloud Sync
 */
function initSupabaseService() {
    const url = localStorage.getItem(STORAGE_KEYS.SUPABASE_URL) || DEFAULT_SUPABASE_URL;
    const key = localStorage.getItem(STORAGE_KEYS.SUPABASE_KEY) || DEFAULT_SUPABASE_KEY;

    if (url && key && window.supabase) {
        try {
            supabaseClient = window.supabase.createClient(url, key);
        } catch (err) {
            console.error('Supabase Client error:', err);
            supabaseClient = null;
        }
    } else {
        supabaseClient = null;
    }

    return isSupabaseConnected();
}

/**
 * Check Connection Status
 */
function isSupabaseConnected() {
    return supabaseClient !== null;
}

/**
 * Synchronously get local employees for zero-latency instant rendering
 */
function getLocalEmployeesSync() {
    try {
        const raw = localStorage.getItem(STORAGE_KEYS.DEMO_EMPLOYEES);
        if (raw !== null) {
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : INITIAL_DEMO_EMPLOYEES;
        }
    } catch (e) {}
    return INITIAL_DEMO_EMPLOYEES;
}

/**
 * Synchronously get local evaluations for zero-latency instant rendering
 */
function getLocalEvaluationsSync() {
    try {
        const raw = localStorage.getItem(STORAGE_KEYS.DEMO_EVALUATIONS);
        if (raw !== null) {
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : INITIAL_DEMO_EVALUATIONS;
        }
    } catch (e) {}
    return INITIAL_DEMO_EVALUATIONS;
}

/**
 * Fetch all employees (Supabase Live Cloud DB Priority)
 */
async function fetchEmployees() {
    if (isSupabaseConnected()) {
        try {
            const res = await withTimeout(
                supabaseClient.from('employees').select('*').order('created_at', { ascending: false }),
                1500
            );
            if (res && !res.error && Array.isArray(res.data)) {
                localStorage.setItem(STORAGE_KEYS.DEMO_EMPLOYEES, JSON.stringify(res.data));
                return res.data;
            }
        } catch (e) {
            console.warn('Supabase fetch employees fallback:', e.message);
        }
    }

    return getLocalEmployeesSync();
}

/**
 * Add a new employee (Instant permanent save with valid UUIDv4 & correct schema columns)
 */
async function createEmployee(employeeData) {
    const avatarVal = employeeData.avatar_url || employeeData.avatar || '';

    // Generate valid UUIDv4 to satisfy Postgres UUID column requirement
    const newId = (typeof crypto !== 'undefined' && crypto.randomUUID) ? 
        crypto.randomUUID() : 
        '10000000-1000-4000-8000-' + String(Date.now()).padStart(12, '0');

    const newEmp = {
        id: newId,
        name: employeeData.name,
        role: employeeData.role,
        avatar: avatarVal,
        avatar_url: avatarVal,
        created_at: new Date().toISOString()
    };

    // 1. Instant local persistence
    try {
        let current = getLocalEmployeesSync();
        current = current.filter(e => e.id !== newEmp.id);
        current.unshift(newEmp);
        localStorage.setItem(STORAGE_KEYS.DEMO_EMPLOYEES, JSON.stringify(current));
    } catch (err) {
        console.error('Error saving to localStorage:', err);
    }

    // 2. Cloud insert with correct UUID and matching 'avatar' column
    if (isSupabaseConnected()) {
        const dbPayload = {
            id: newEmp.id,
            name: newEmp.name,
            role: newEmp.role,
            avatar: avatarVal,
            created_at: newEmp.created_at
        };
        try {
            const res = await supabaseClient.from('employees').insert([dbPayload]);
            if (res.error) {
                console.warn('Supabase primary insert failed, trying fallback without avatar:', res.error.message);
                const fallbackPayload = {
                    id: newEmp.id,
                    name: newEmp.name,
                    role: newEmp.role,
                    created_at: newEmp.created_at
                };
                await supabaseClient.from('employees').insert([fallbackPayload]);
            }
        } catch (e) {
            console.warn('Supabase insert employee error:', e.message);
        }
    }

    return newEmp;
}

/**
 * Fetch all evaluations (Supabase Live Cloud DB Priority)
 */
async function fetchEvaluations() {
    if (isSupabaseConnected()) {
        try {
            const res = await withTimeout(
                supabaseClient.from('evaluations').select('*').order('created_at', { ascending: false }),
                1500
            );
            if (res && !res.error && Array.isArray(res.data)) {
                localStorage.setItem(STORAGE_KEYS.DEMO_EVALUATIONS, JSON.stringify(res.data));
                return res.data;
            }
        } catch (e) {
            console.warn('Supabase fetch evaluations fallback:', e.message);
        }
    }

    return getLocalEvaluationsSync();
}

/**
 * Add a new evaluation (Valid UUID & evaluation_date required field)
 */
async function createEvaluation(evalData) {
    const newId = (typeof crypto !== 'undefined' && crypto.randomUUID) ? 
        crypto.randomUUID() : 
        '20000000-2000-4000-8000-' + String(Date.now()).padStart(12, '0');

    const evalDate = evalData.evaluation_date || new Date().toISOString().split('T')[0];

    const newEval = {
        id: newId,
        ...evalData,
        evaluation_date: evalDate,
        created_at: new Date().toISOString()
    };

    try {
        let current = getLocalEvaluationsSync();
        current = current.filter(ev => ev.id !== newEval.id);
        current.unshift(newEval);
        localStorage.setItem(STORAGE_KEYS.DEMO_EVALUATIONS, JSON.stringify(current));
    } catch (err) {
        console.error('Error saving evaluation to localStorage:', err);
    }

    if (isSupabaseConnected()) {
        try {
            const dbPayload1 = {
                id: newEval.id,
                employee_id: newEval.employee_id,
                evaluator_name: newEval.evaluator_name || '',
                evaluation_date: evalDate,
                rating: parseFloat(newEval.rating || newEval.overallScore || 5),
                quality_rating: parseFloat(newEval.quality_rating || 5),
                speed_rating: parseFloat(newEval.speed_rating || 5),
                cleanliness_rating: parseFloat(newEval.cleanliness_rating || 5),
                teamwork_rating: parseFloat(newEval.teamwork_rating || 5),
                notes: newEval.notes || '',
                created_at: newEval.created_at
            };
            const res1 = await supabaseClient.from('evaluations').insert([dbPayload1]);

            if (res1.error) {
                console.warn('Evaluation insert payload 1 error, trying auto UUID:', res1.error.message);
                delete dbPayload1.id;
                await supabaseClient.from('evaluations').insert([dbPayload1]);
            }
        } catch (e) {
            console.warn('Supabase insert evaluation note:', e.message);
        }
    }

    return newEval;
}

/**
 * Update an existing evaluation
 */
async function updateEvaluation(evalId, evalData) {
    try {
        const raw = localStorage.getItem(STORAGE_KEYS.DEMO_EVALUATIONS);
        if (raw) {
            let evals = JSON.parse(raw);
            const index = evals.findIndex(ev => ev.id === evalId);
            if (index !== -1) {
                evals[index] = { ...evals[index], ...evalData };
                localStorage.setItem(STORAGE_KEYS.DEMO_EVALUATIONS, JSON.stringify(evals));
            }
        }
    } catch (e) {
        console.error('Error updating evaluation in localStorage:', e);
    }

    if (isSupabaseConnected()) {
        const dbPayload = {};
        if (evalData.evaluator_name !== undefined) dbPayload.evaluator_name = evalData.evaluator_name;
        if (evalData.rating !== undefined) dbPayload.rating = parseFloat(evalData.rating);
        if (evalData.hygiene !== undefined) dbPayload.hygiene = parseFloat(evalData.hygiene);
        if (evalData.apron !== undefined) dbPayload.apron = parseFloat(evalData.apron);
        if (evalData.nails !== undefined) dbPayload.nails = parseFloat(evalData.nails);
        if (evalData.punctuality !== undefined) dbPayload.punctuality = parseFloat(evalData.punctuality);
        if (evalData.speed !== undefined) dbPayload.speed = parseFloat(evalData.speed);
        if (evalData.quality !== undefined) dbPayload.quality = parseFloat(evalData.quality);
        if (evalData.shift_time !== undefined) dbPayload.shift_time = evalData.shift_time;
        if (evalData.notes !== undefined) dbPayload.notes = evalData.notes;

        withTimeout(supabaseClient.from('evaluations').update(dbPayload).eq('id', evalId), 1500).catch(() => {});
    }

    return true;
}

/**
 * Delete a single evaluation permanently
 */
async function deleteSingleEvaluation(evalId) {
    try {
        const rawEvals = localStorage.getItem(STORAGE_KEYS.DEMO_EVALUATIONS);
        if (rawEvals) {
            const evals = JSON.parse(rawEvals).filter(ev => ev.id !== evalId);
            localStorage.setItem(STORAGE_KEYS.DEMO_EVALUATIONS, JSON.stringify(evals));
        }
    } catch (e) {
        console.error('Error deleting single evaluation:', e);
    }

    if (isSupabaseConnected()) {
        withTimeout(supabaseClient.from('evaluations').delete().eq('id', evalId), 1500).catch(() => {});
    }

    return true;
}

/**
 * Delete all employees and evaluations permanently (Clean Cloud Database Reset)
 */
async function deleteAllEmployees() {
    try {
        localStorage.setItem(STORAGE_KEYS.DEMO_EMPLOYEES, JSON.stringify([]));
        localStorage.setItem(STORAGE_KEYS.DEMO_EVALUATIONS, JSON.stringify([]));
    } catch (e) {
        console.error('Error clearing data:', e);
    }

    if (isSupabaseConnected()) {
        try {
            // 1. Delete evaluations first to satisfy foreign key constraints
            await supabaseClient.from('evaluations').delete().gt('created_at', '1970-01-01T00:00:00Z');
            // 2. Then delete employees
            await supabaseClient.from('employees').delete().gt('created_at', '1970-01-01T00:00:00Z');
        } catch (e) {
            console.error('Error in deleteAllEmployees:', e);
        }
    }

    return true;
}

/**
 * Delete an employee and associated evaluations permanently
 */
async function deleteEmployee(employeeId) {
    try {
        const rawEmps = localStorage.getItem(STORAGE_KEYS.DEMO_EMPLOYEES);
        let updatedEmps = [];
        if (rawEmps) {
            updatedEmps = JSON.parse(rawEmps).filter(e => e.id !== employeeId);
            localStorage.setItem(STORAGE_KEYS.DEMO_EMPLOYEES, JSON.stringify(updatedEmps));
        }

        const rawEvals = localStorage.getItem(STORAGE_KEYS.DEMO_EVALUATIONS);
        if (rawEvals) {
            const evals = JSON.parse(rawEvals).filter(ev => ev.employee_id !== employeeId);
            localStorage.setItem(STORAGE_KEYS.DEMO_EVALUATIONS, JSON.stringify(evals));
        }
    } catch (e) {
        console.error('Error deleting employee:', e);
    }

    if (isSupabaseConnected()) {
        try {
            // Delete child evaluations first to satisfy foreign key constraints
            await supabaseClient.from('evaluations').delete().eq('employee_id', employeeId);
            // Then delete parent employee row
            await supabaseClient.from('employees').delete().eq('id', employeeId);
        } catch (err) {
            console.warn('Supabase delete employee error:', err.message);
        }
    }

    return true;
}

/**
 * Update an existing employee profile (Name, Role, Avatar)
 */
async function updateEmployee(employeeId, employeeData) {
    try {
        const rawEmps = localStorage.getItem(STORAGE_KEYS.DEMO_EMPLOYEES);
        if (rawEmps) {
            let emps = JSON.parse(rawEmps);
            const index = emps.findIndex(e => e.id === employeeId);
            if (index !== -1) {
                emps[index] = { ...emps[index], ...employeeData };
                localStorage.setItem(STORAGE_KEYS.DEMO_EMPLOYEES, JSON.stringify(emps));
            }
        }
    } catch (e) {
        console.error('Error updating employee profile:', e);
    }

    if (isSupabaseConnected()) {
        const dbPayload = {};
        if (employeeData.name !== undefined) dbPayload.name = employeeData.name;
        if (employeeData.role !== undefined) dbPayload.role = employeeData.role;
        if (employeeData.avatar_url !== undefined || employeeData.avatar !== undefined) {
            dbPayload.avatar = employeeData.avatar_url || employeeData.avatar || '';
        }
        withTimeout(supabaseClient.from('employees').update(dbPayload).eq('id', employeeId), 1500).catch(() => {});
    }

    return true;
}
