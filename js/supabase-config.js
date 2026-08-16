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

// Initial Seed Data (Empty for fresh live start)
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

/**
 * Initialize Local Store & Optional Supabase Sync
 */
function initSupabaseService() {
    const url = localStorage.getItem(STORAGE_KEYS.SUPABASE_URL);
    const key = localStorage.getItem(STORAGE_KEYS.SUPABASE_KEY);

    if (url && key && url.startsWith('http') && window.supabase) {
        try {
            supabaseClient = window.supabase.createClient(url, key);
        } catch (err) {
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
 * Fetch all employees (Strict local storage priority)
 */
async function fetchEmployees() {
    // If user explicitly cleared data, return empty array immediately
    if (localStorage.getItem('coffeelab_is_cleared') === 'true') {
        return [];
    }

    let localEmps = [];
    try {
        const raw = localStorage.getItem(STORAGE_KEYS.DEMO_EMPLOYEES);
        localEmps = raw ? JSON.parse(raw) : [];
    } catch (e) {
        localEmps = [];
    }

    // Only query Supabase if local store has never been set
    if (isSupabaseConnected() && !localStorage.getItem(STORAGE_KEYS.DEMO_EMPLOYEES)) {
        try {
            const res = await withTimeout(
                supabaseClient.from('employees').select('*').order('created_at', { ascending: false }),
                800
            );
            if (res && !res.error && res.data && res.data.length > 0) {
                localStorage.setItem(STORAGE_KEYS.DEMO_EMPLOYEES, JSON.stringify(res.data));
                return res.data;
            }
        } catch (e) {
            console.warn('Supabase fetch employees timeout/error:', e.message);
        }
    }

    return localEmps;
}

/**
 * Add a new employee (Instant permanent save)
 */
async function createEmployee(employeeData) {
    // Clear the empty flag since a new employee is added
    localStorage.removeItem('coffeelab_is_cleared');

    const newEmp = {
        id: 'emp_' + Date.now(),
        ...employeeData,
        created_at: new Date().toISOString()
    };

    try {
        let current = [];
        const raw = localStorage.getItem(STORAGE_KEYS.DEMO_EMPLOYEES);
        if (raw) {
            current = JSON.parse(raw);
        }
        if (!current || !Array.isArray(current)) {
            current = [];
        }
        current.unshift(newEmp);
        localStorage.setItem(STORAGE_KEYS.DEMO_EMPLOYEES, JSON.stringify(current));
    } catch (err) {
        console.error('Error saving to localStorage:', err);
    }

    if (isSupabaseConnected()) {
        withTimeout(supabaseClient.from('employees').insert([employeeData]), 1000).catch(() => {});
    }

    return newEmp;
}

/**
 * Fetch all evaluations
 */
async function fetchEvaluations() {
    if (localStorage.getItem('coffeelab_is_cleared') === 'true') {
        return [];
    }

    let localEvals = [];
    try {
        const raw = localStorage.getItem(STORAGE_KEYS.DEMO_EVALUATIONS);
        localEvals = raw ? JSON.parse(raw) : [];
    } catch (e) {
        localEvals = [];
    }

    return localEvals;
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
        let current = [];
        const raw = localStorage.getItem(STORAGE_KEYS.DEMO_EVALUATIONS);
        if (raw) {
            current = JSON.parse(raw);
        }
        current.unshift(newEval);
        localStorage.setItem(STORAGE_KEYS.DEMO_EVALUATIONS, JSON.stringify(current));
    } catch (err) {
        console.error('Error saving evaluation to localStorage:', err);
    }

    if (isSupabaseConnected()) {
        withTimeout(supabaseClient.from('evaluations').insert([evalData]), 1000).catch(() => {});
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
        withTimeout(supabaseClient.from('evaluations').update(evalData).eq('id', evalId), 1000).catch(() => {});
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
        withTimeout(supabaseClient.from('evaluations').delete().eq('id', evalId), 1000).catch(() => {});
    }

    return true;
}

/**
 * Delete all employees and evaluations permanently
 */
async function deleteAllEmployees() {
    try {
        localStorage.setItem('coffeelab_is_cleared', 'true');
        localStorage.setItem(STORAGE_KEYS.DEMO_EMPLOYEES, JSON.stringify([]));
        localStorage.setItem(STORAGE_KEYS.DEMO_EVALUATIONS, JSON.stringify([]));
    } catch (e) {
        console.error('Error clearing data:', e);
    }

    if (isSupabaseConnected()) {
        withTimeout(supabaseClient.from('employees').delete().neq('id', '0'), 1000).catch(() => {});
        withTimeout(supabaseClient.from('evaluations').delete().neq('id', '0'), 1000).catch(() => {});
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

        if (updatedEmps.length === 0) {
            localStorage.setItem('coffeelab_is_cleared', 'true');
        }
    } catch (e) {
        console.error('Error deleting employee:', e);
    }

    if (isSupabaseConnected()) {
        withTimeout(supabaseClient.from('employees').delete().eq('id', employeeId), 1000).catch(() => {});
        withTimeout(supabaseClient.from('evaluations').delete().eq('employee_id', employeeId), 1000).catch(() => {});
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
        withTimeout(supabaseClient.from('employees').update(employeeData).eq('id', employeeId), 1000).catch(() => {});
    }

    return true;
}
