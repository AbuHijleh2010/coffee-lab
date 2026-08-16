/* ==========================================================================
   COFFEE LAB - SUPABASE & DATA PERSISTENCE SERVICE
   ========================================================================== */

const STORAGE_KEYS = {
    SUPABASE_URL: 'coffeelab_supabase_url',
    SUPABASE_KEY: 'coffeelab_supabase_key',
    DEMO_EMPLOYEES: 'coffeelab_demo_employees_v8',
    DEMO_EVALUATIONS: 'coffeelab_demo_evaluations_v8'
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
 * Fetch all employees (Supabase Live Cloud DB with Strict 1000ms Timeout)
 */
async function fetchEmployees() {
    const local = getLocalEmployeesSync();

    if (isSupabaseConnected()) {
        try {
            const res = await withTimeout(
                supabaseClient.from('employees').select('*').order('created_at', { ascending: false }),
                1500
            );
            if (res && !res.error && Array.isArray(res.data)) {
                const cloudMap = new Map();
                res.data.forEach(emp => {
                    if (emp && emp.id) cloudMap.set(emp.id, emp);
                });
                local.forEach(emp => {
                    if (emp && emp.id && !cloudMap.has(emp.id)) {
                        cloudMap.set(emp.id, emp);
                    }
                });
                const merged = Array.from(cloudMap.values());
                localStorage.setItem(STORAGE_KEYS.DEMO_EMPLOYEES, JSON.stringify(merged));
                return merged;
            }
        } catch (e) {
            console.warn('Supabase fetch employees fallback:', e.message);
        }
    }

    return local;
}

/**
 * Add a new employee (Instant permanent save)
 */
async function createEmployee(employeeData) {
    localStorage.removeItem('coffeelab_is_cleared');

    const avatarVal = employeeData.avatar_url || employeeData.avatar || '';
    const newEmp = {
        id: 'emp_' + Date.now(),
        name: employeeData.name,
        role: employeeData.role,
        avatar: avatarVal,
        avatar_url: avatarVal,
        created_at: new Date().toISOString()
    };

    try {
        let current = getLocalEmployeesSync();
        current.unshift(newEmp);
        localStorage.setItem(STORAGE_KEYS.DEMO_EMPLOYEES, JSON.stringify(current));
    } catch (err) {
        console.error('Error saving to localStorage:', err);
    }

    if (isSupabaseConnected()) {
        const dbPayload = {
            id: newEmp.id,
            name: newEmp.name,
            role: newEmp.role,
            avatar: avatarVal,
            created_at: newEmp.created_at
        };
        try {
            await withTimeout(supabaseClient.from('employees').insert([dbPayload]), 2000);
        } catch (e) {
            console.warn('Supabase insert employee note:', e.message);
        }
    }

    return newEmp;
}

/**
 * Fetch all evaluations (Merged Live Cloud & Instant Local Cache)
 */
async function fetchEvaluations() {
    const local = getLocalEvaluationsSync();

    if (isSupabaseConnected()) {
        try {
            const res = await withTimeout(
                supabaseClient.from('evaluations').select('*').order('created_at', { ascending: false }),
                1500
            );
            if (res && !res.error && Array.isArray(res.data)) {
                const cloudMap = new Map();
                res.data.forEach(ev => {
                    if (ev && ev.id) cloudMap.set(ev.id, ev);
                });
                local.forEach(ev => {
                    if (ev && ev.id && !cloudMap.has(ev.id)) {
                        cloudMap.set(ev.id, ev);
                    }
                });
                const merged = Array.from(cloudMap.values());
                localStorage.setItem(STORAGE_KEYS.DEMO_EVALUATIONS, JSON.stringify(merged));
                return merged;
            }
        } catch (e) {
            console.warn('Supabase fetch evaluations fallback:', e.message);
        }
    }

    return local;
}

/**
 * Save new evaluation (Instant permanent save)
 */
async function createEvaluation(evalData) {
    const newEval = {
        id: 'eval_' + Date.now(),
        ...evalData,
        created_at: new Date().toISOString()
    };

    try {
        let current = getLocalEvaluationsSync();
        current.unshift(newEval);
        localStorage.setItem(STORAGE_KEYS.DEMO_EVALUATIONS, JSON.stringify(current));
    } catch (err) {
        console.error('Error saving evaluation to localStorage:', err);
    }

    if (isSupabaseConnected()) {
        const dbPayload = {
            id: newEval.id,
            employee_id: newEval.employee_id,
            evaluator_name: newEval.evaluator_name || '',
            rating: parseFloat(newEval.rating || 0),
            hygiene: parseFloat(newEval.hygiene || 0),
            apron: parseFloat(newEval.apron || 0),
            nails: parseFloat(newEval.nails || 0),
            punctuality: parseFloat(newEval.punctuality || 0),
            speed: parseFloat(newEval.speed || 0),
            quality: parseFloat(newEval.quality || 0),
            shift_time: newEval.shift_time || '',
            notes: newEval.notes || '',
            created_at: newEval.created_at
        };
        try {
            await withTimeout(supabaseClient.from('evaluations').insert([dbPayload]), 2000);
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
 * Delete all employees and evaluations permanently
 */
async function deleteAllEmployees() {
    try {
        localStorage.setItem(STORAGE_KEYS.DEMO_EMPLOYEES, JSON.stringify([]));
        localStorage.setItem(STORAGE_KEYS.DEMO_EVALUATIONS, JSON.stringify([]));
    } catch (e) {
        console.error('Error clearing data:', e);
    }

    if (isSupabaseConnected()) {
        withTimeout(supabaseClient.from('employees').delete().neq('id', '0'), 1500).catch(() => {});
        withTimeout(supabaseClient.from('evaluations').delete().neq('id', '0'), 1500).catch(() => {});
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
        withTimeout(supabaseClient.from('employees').delete().eq('id', employeeId), 1500).catch(() => {});
        withTimeout(supabaseClient.from('evaluations').delete().eq('employee_id', employeeId), 1500).catch(() => {});
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
