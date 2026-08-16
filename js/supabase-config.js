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
                const processed = res.data.map(emp => ({
                    ...emp,
                    avatar_url: emp.avatar_url || emp.avatar || ''
                }));
                localStorage.setItem(STORAGE_KEYS.DEMO_EMPLOYEES, JSON.stringify(processed));
                return processed;
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
                // Parse notes JSON if present to restore custom fields
                const processed = res.data.map(ev => {
                    if (ev.notes && ev.notes.startsWith('{') && ev.notes.endsWith('}')) {
                        try {
                            const parsed = JSON.parse(ev.notes);
                            return { ...ev, ...parsed };
                        } catch (err) {
                            console.warn('Failed to parse evaluation notes JSON:', err);
                        }
                    }
                    return ev;
                });
                localStorage.setItem(STORAGE_KEYS.DEMO_EVALUATIONS, JSON.stringify(processed));
                return processed;
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
            // Serialize all custom fields into the notes column to store them in Supabase
            const jsonNotes = JSON.stringify({
                bar_station: newEval.bar_station || 'cold',
                shift_type: newEval.shift_type || 'صباحي',
                quiz_drink_name: newEval.quiz_drink_name || '',
                quiz_rating: newEval.quiz_rating || 5,
                organization_rating: newEval.organization_rating || 5,
                work_method_rating: newEval.work_method_rating || 5,
                return_items_rating: newEval.return_items_rating || 5,
                espresso_dose_status: newEval.espresso_dose_status || '',
                espresso_extraction_status: newEval.espresso_extraction_status || '',
                apronUniformStatus: newEval.apronUniformStatus || 'نظيف ومرتب بالكامل',
                hygieneNailsStatus: newEval.hygieneNailsStatus || 'ممتاز وملتزم بالكامل',
                grooming_rating: newEval.grooming_rating || 5,
                arrivalTime: newEval.arrivalTime || '',
                attendanceStatus: newEval.attendanceStatus || 'على الوقت بالدقيقة / مبكر',
                attendance_rating: newEval.attendance_rating || 5,
                equipment_statuses: newEval.equipment_statuses || [],
                evalMistakes: newEval.evalMistakes || '',
                notes: newEval.notes || ''
            });

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
                notes: jsonNotes,
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
        // Merge with existing evaluation to preserve other fields in JSON
        let mergedEval = { ...evalData };
        try {
            const raw = localStorage.getItem(STORAGE_KEYS.DEMO_EVALUATIONS);
            if (raw) {
                const evals = JSON.parse(raw);
                const existing = evals.find(ev => ev.id === evalId);
                if (existing) {
                    mergedEval = { ...existing, ...evalData };
                }
            }
        } catch (err) {
            console.error('Error merging evaluation for update:', err);
        }

        const jsonNotes = JSON.stringify({
            bar_station: mergedEval.bar_station || 'cold',
            shift_type: mergedEval.shift_type || 'صباحي',
            quiz_drink_name: mergedEval.quiz_drink_name || '',
            quiz_rating: mergedEval.quiz_rating || 5,
            organization_rating: mergedEval.organization_rating || 5,
            work_method_rating: mergedEval.work_method_rating || 5,
            return_items_rating: mergedEval.return_items_rating || 5,
            espresso_dose_status: mergedEval.espresso_dose_status || '',
            espresso_extraction_status: mergedEval.espresso_extraction_status || '',
            apronUniformStatus: mergedEval.apronUniformStatus || 'نظيف ومرتب بالكامل',
            hygieneNailsStatus: mergedEval.hygieneNailsStatus || 'ممتاز وملتزم بالكامل',
            grooming_rating: mergedEval.grooming_rating || 5,
            arrivalTime: mergedEval.arrivalTime || '',
            attendanceStatus: mergedEval.attendanceStatus || 'على الوقت بالدقيقة / مبكر',
            attendance_rating: mergedEval.attendance_rating || 5,
            equipment_statuses: mergedEval.equipment_statuses || [],
            evalMistakes: mergedEval.evalMistakes || '',
            notes: mergedEval.notes || ''
        });

        const dbPayload = {};
        if (mergedEval.evaluator_name !== undefined) dbPayload.evaluator_name = mergedEval.evaluator_name;
        if (mergedEval.evaluation_date !== undefined) dbPayload.evaluation_date = mergedEval.evaluation_date;
        if (mergedEval.rating !== undefined) dbPayload.rating = parseFloat(mergedEval.rating);
        
        // Match actual database columns
        if (mergedEval.quality_rating !== undefined) dbPayload.quality_rating = parseFloat(mergedEval.quality_rating);
        if (mergedEval.speed_rating !== undefined) dbPayload.speed_rating = parseFloat(mergedEval.speed_rating);
        if (mergedEval.cleanliness_rating !== undefined) dbPayload.cleanliness_rating = parseFloat(mergedEval.cleanliness_rating);
        if (mergedEval.teamwork_rating !== undefined) dbPayload.teamwork_rating = parseFloat(mergedEval.teamwork_rating);
        dbPayload.notes = jsonNotes;

        try {
            const res = await withTimeout(supabaseClient.from('evaluations').update(dbPayload).eq('id', evalId), 2000);
            if (res && res.error) {
                console.warn('Supabase update evaluation failed, trying fallback with only primary columns:', res.error.message);
                const fallbackPayload = {
                    evaluator_name: dbPayload.evaluator_name || '',
                    rating: dbPayload.rating || 5,
                    notes: dbPayload.notes || ''
                };
                await withTimeout(supabaseClient.from('evaluations').update(fallbackPayload).eq('id', evalId), 2000);
            }
        } catch (err) {
            console.warn('Supabase update evaluation error:', err.message);
        }
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
        try {
            await withTimeout(supabaseClient.from('evaluations').delete().eq('id', evalId), 1500);
        } catch (err) {
            console.warn('Supabase delete evaluation error:', err.message);
        }
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
        const basePayload = {};
        if (employeeData.name !== undefined) basePayload.name = employeeData.name;
        if (employeeData.role !== undefined) basePayload.role = employeeData.role;

        const avatarVal = employeeData.avatar_url || employeeData.avatar || '';
        const payloadWithAvatar = { ...basePayload, avatar: avatarVal };

        try {
            // Try updating with avatar column first
            const res = await withTimeout(
                supabaseClient.from('employees').update(payloadWithAvatar).eq('id', employeeId),
                2000
            );
            if (res && res.error) {
                console.warn('Supabase update with avatar failed, trying fallback without avatar:', res.error.message);
                // Fallback: update only name and role
                const fallbackRes = await withTimeout(
                    supabaseClient.from('employees').update(basePayload).eq('id', employeeId),
                    2000
                );
                if (fallbackRes && fallbackRes.error) {
                    console.error('Supabase fallback update failed:', fallbackRes.error.message);
                }
            }
        } catch (err) {
            console.warn('Supabase update employee error:', err.message);
        }
    }

    return true;
}
