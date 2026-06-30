window.MATHQUEST_CONFIG = {
    firebaseConfig: {
        apiKey: 'AIzaSyA2xD3W8W8uqoc8nTG2FExgDDDj4u0zono',
        authDomain: 'non-s-firebase-20260621.firebaseapp.com',
        databaseURL: 'https://non-s-firebase-20260621-default-rtdb.firebaseio.com',
        projectId: 'non-s-firebase-20260621',
        storageBucket: 'non-s-firebase-20260621.firebasestorage.app',
        messagingSenderId: '459551505638',
        appId: '1:459551505638:web:a51eadf0ed941c22af8f27',
    },
};

firebase.initializeApp(window.MATHQUEST_CONFIG.firebaseConfig);
const mqAuth = firebase.auth();
const mqDb = firebase.firestore();
// Redes de escola/proxy bloqueiam WebSocket/HTTP2 streaming do Firestore,
// causando o ciclo 503 → retry que trava o loader por 10-20s.
// experimentalAutoDetectLongPolling detecta isso e muda pra long-polling
// automaticamente, reduzindo o tempo de carregamento nesses ambientes.
mqDb.settings({ experimentalAutoDetectLongPolling: true, merge: true });

window.MQ_BACKEND_CONFIGURED = true;

const TABLE_COLLECTIONS = {
    profiles: 'profiles',
    mathquest_progress: 'mathquest_progress',
    classes: 'classes',
    class_members: 'class_members',
    teacher_unlocks: 'teacher_unlocks',
    class_messages: 'class_messages',
};

const MQ_FIRESTORE_IN_LIMIT = 30;
const MQ_LIMITS = Object.freeze({
    classes: 100,
    classMembers: 200,
    classMemberCounts: 1000,
    leaderboard: 100,
    teacherUnlocks: 500,
    classMessages: 50,
    progressRows: 200,
});

function mqNow() {
    return new Date().toISOString();
}

function mqSnapshotToRecord(doc) {
    const data = doc.data() || {};
    const normalized = {};
    Object.entries(data).forEach(([key, value]) => {
        normalized[key] = value && typeof value.toDate === 'function' ? value.toDate().toISOString() : value;
    });
    return { id: doc.id, ...normalized };
}

function mqRecordMatches(record, filter) {
    const value = record[filter.field];
    if (filter.op === 'eq') return value === filter.value;
    if (filter.op === 'in') return filter.value.includes(value);
    if (filter.op === 'gte') return String(value ?? '') >= String(filter.value ?? '');
    return true;
}

function mqSortBy(field, ascending = true) {
    return (a, b) => {
        const result = String(a[field] ?? '').localeCompare(String(b[field] ?? ''), undefined, { numeric: true });
        return ascending ? result : -result;
    };
}

function mqChunks(items, size) {
    const chunks = [];
    for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
    return chunks;
}

function mqDefaultLimit(collectionName) {
    if (collectionName === 'classes') return MQ_LIMITS.classes;
    if (collectionName === 'class_members') return MQ_LIMITS.classMemberCounts;
    if (collectionName === 'teacher_unlocks') return MQ_LIMITS.teacherUnlocks;
    if (collectionName === 'class_messages') return MQ_LIMITS.classMessages;
    if (collectionName === 'mathquest_progress') return MQ_LIMITS.progressRows;
    return null;
}

function mqDocId(collectionName, payload) {
    if (collectionName === 'profiles') return payload.user_id;
    if (collectionName === 'mathquest_progress') return payload.user_id;
    if (collectionName === 'classes') return payload.code;
    if (collectionName === 'class_members') return `${payload.class_code}_${payload.user_id}`;
    if (collectionName === 'teacher_unlocks') return `${payload.class_code}_${payload.user_id}_${payload.region}`;
    return null;
}

class MathQuestQuery {
    constructor(table) {
        this.collectionName = TABLE_COLLECTIONS[table] || table;
        this.filters = [];
        this.orders = [];
        this.limitCount = null;
        this.expectSingle = false;
        this.mode = 'select';
        this.payload = null;
    }

    select() {
        this.mode = 'select';
        return this;
    }

    eq(field, value) {
        this.filters.push({ field, op: 'eq', value });
        return this;
    }

    in(field, value) {
        this.filters.push({ field, op: 'in', value });
        return this;
    }

    gte(field, value) {
        this.filters.push({ field, op: 'gte', value });
        return this;
    }

    order(field, options = {}) {
        this.orders.push({ field, ascending: options.ascending !== false });
        return this;
    }

    limit(count) {
        this.limitCount = count;
        return this;
    }

    maybeSingle() {
        this.expectSingle = true;
        return this.execute();
    }

    single() {
        this.expectSingle = true;
        return this.execute();
    }

    insert(payload) {
        this.mode = 'insert';
        this.payload = Array.isArray(payload) ? payload[0] : payload;
        return this.execute();
    }

    upsert(payload) {
        this.mode = 'upsert';
        this.payload = Array.isArray(payload) ? payload[0] : payload;
        return this.execute();
    }

    delete() {
        this.mode = 'delete';
        return this;
    }

    then(resolve, reject) {
        return this.execute().then(resolve, reject);
    }

    async execute() {
        try {
            if (this.mode === 'insert' || this.mode === 'upsert') {
                const payload = {
                    ...this.payload,
                    created_at: this.payload.created_at || mqNow(),
                    updated_at: this.payload.updated_at || mqNow(),
                };
                const id = mqDocId(this.collectionName, payload);
                if (id) {
                    await mqDb.collection(this.collectionName).doc(id).set(payload, { merge: this.mode === 'upsert' });
                    return { data: [{ id, ...payload }], error: null };
                }
                const ref = await mqDb.collection(this.collectionName).add(payload);
                return { data: [{ id: ref.id, ...payload }], error: null };
            }

            if (this.mode === 'delete') {
                const codeFilter = this.filters.find(filter => filter.field === 'code' && filter.op === 'eq');
                const idFilter = this.filters.find(filter => filter.field === 'id' && filter.op === 'eq');
                const id = codeFilter?.value || idFilter?.value;
                if (!id) throw new Error('Exclusao requer filtro por id ou code.');
                await mqDb.collection(this.collectionName).doc(id).delete();
                return { data: null, error: null };
            }

            let ref = mqDb.collection(this.collectionName);
            const idFilter = this.filters.find(filter => filter.field === 'id' && filter.op === 'eq');
            const effectiveLimit = this.expectSingle ? 1 : (this.limitCount || mqDefaultLimit(this.collectionName));
            let docs;
            if (idFilter) {
                const doc = await ref.doc(idFilter.value).get();
                docs = doc.exists ? [doc] : [];
            } else {
                const applyServerFilters = (baseRef, filters) => {
                    let nextRef = baseRef;
                    filters.forEach(filter => {
                        if (filter.op === 'eq') nextRef = nextRef.where(filter.field, '==', filter.value);
                        if (filter.op === 'in' && Array.isArray(filter.value) && filter.value.length) {
                            nextRef = nextRef.where(filter.field, 'in', filter.value);
                        }
                        if (filter.op === 'gte') nextRef = nextRef.where(filter.field, '>=', filter.value);
                    });
                    this.orders.forEach(order => {
                        nextRef = nextRef.orderBy(order.field, order.ascending ? 'asc' : 'desc');
                    });
                    if (effectiveLimit) nextRef = nextRef.limit(effectiveLimit);
                    return nextRef;
                };
                const oversizedIn = this.filters.find(filter =>
                    filter.op === 'in' && Array.isArray(filter.value) && filter.value.length > MQ_FIRESTORE_IN_LIMIT);
                if (oversizedIn) {
                    const otherFilters = this.filters.filter(filter => filter !== oversizedIn);
                    const batches = await Promise.all(mqChunks(oversizedIn.value, MQ_FIRESTORE_IN_LIMIT).map(chunk => {
                        const refForChunk = applyServerFilters(ref, [
                            ...otherFilters,
                            { ...oversizedIn, value: chunk },
                        ]);
                        return refForChunk.get();
                    }));
                    docs = batches.flatMap(snapshot => snapshot.docs);
                } else {
                    docs = (await applyServerFilters(ref, this.filters).get()).docs;
                }
            }

            let data = docs.map(mqSnapshotToRecord).filter(record => this.filters.every(filter => mqRecordMatches(record, filter)));
            for (const order of [...this.orders].reverse()) data = data.sort(mqSortBy(order.field, order.ascending));
            if (this.limitCount || effectiveLimit) data = data.slice(0, this.limitCount || effectiveLimit);
            return { data: this.expectSingle ? (data[0] || null) : data, error: null };
        } catch (error) {
            return { data: this.expectSingle ? null : [], error };
        }
    }
}

function mqAuthSession(user) {
    return user ? { user: { id: user.uid, email: user.email, uid: user.uid } } : null;
}

async function mqGetCurrentUser() {
    if (mqAuth.currentUser) return mqAuth.currentUser;
    return new Promise(resolve => {
        const unsubscribe = mqAuth.onAuthStateChanged(user => {
            unsubscribe();
            resolve(user);
        });
    });
}

async function mqJoinClass(code) {
    const user = await mqGetCurrentUser();
    if (!user) throw new Error('Usuario nao autenticado.');
    const clsDoc = await mqDb.collection('classes').doc(code).get();
    if (!clsDoc.exists) return null;
    const cls = { code: clsDoc.id, ...clsDoc.data() };
    await mqDb.collection('class_members').doc(`${code}_${user.uid}`).set({
        class_code: code,
        teacher_id: cls.teacher_id,
        user_id: user.uid,
        joined_at: mqNow(),
    }, { merge: true });
    return cls;
}

async function mqClassLeaderboard(code) {
    const progress = await mqDb.collection('mathquest_progress')
        .where('class_code', '==', code)
        .limit(MQ_LIMITS.leaderboard)
        .get();
    return progress.docs
        .map(mqSnapshotToRecord)
        .sort((a, b) => (b.xp || 0) - (a.xp || 0))
        .slice(0, MQ_LIMITS.leaderboard);
}

window.MQ_LIMITS = MQ_LIMITS;

window.sb = {
    auth: {
        async getSession() {
            const user = await mqGetCurrentUser();
            return { data: { session: mqAuthSession(user) }, error: null };
        },
        async getUser() {
            const user = await mqGetCurrentUser();
            return { data: { user: user ? { id: user.uid, email: user.email, uid: user.uid } : null }, error: null };
        },
        async signInAnonymously() {
            try {
                const credential = await mqAuth.signInAnonymously();
                return { data: { user: { id: credential.user.uid, uid: credential.user.uid } }, error: null };
            } catch (error) {
                return { data: null, error };
            }
        },
        async signInWithPassword({ email, password }) {
            try {
                const credential = await mqAuth.signInWithEmailAndPassword(email, password);
                return { data: { user: { id: credential.user.uid, email: credential.user.email }, session: mqAuthSession(credential.user) }, error: null };
            } catch (error) {
                return { data: null, error };
            }
        },
        async signUp({ email, password }) {
            try {
                const credential = await mqAuth.createUserWithEmailAndPassword(email, password);
                await mqDb.collection('profiles').doc(credential.user.uid).set({
                    user_id: credential.user.uid,
                    email,
                    role: 'teacher',
                    created_at: mqNow(),
                    updated_at: mqNow(),
                }, { merge: true });
                return { data: { user: { id: credential.user.uid, email }, session: mqAuthSession(credential.user) }, error: null };
            } catch (error) {
                return { data: null, error };
            }
        },
        async signOut() {
            await mqAuth.signOut();
        },
        onAuthStateChange(callback) {
            return mqAuth.onAuthStateChanged(user => {
                callback(user ? 'SIGNED_IN' : 'SIGNED_OUT', mqAuthSession(user));
            });
        },
    },
    from(table) {
        return new MathQuestQuery(table);
    },
    async rpc(name, params) {
        try {
            if (name === 'join_class') return { data: await mqJoinClass(params.p_code), error: null };
            if (name === 'class_leaderboard') return { data: await mqClassLeaderboard(params.p_class_code), error: null };
            throw new Error(`RPC Firebase nao implementada: ${name}`);
        } catch (error) {
            return { data: null, error };
        }
    },
};
