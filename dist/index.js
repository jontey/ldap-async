"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ldapjs_1 = require("ldapjs");
const stream_1 = require("stream");
const filterReplacements = {
    '\0': '\\00',
    '(': '\\28',
    ')': '\\29',
    '*': '\\2a',
    '\\': '\\5c'
};
const dnReplacements = {
    '"': '\\"',
    '#': '\\#',
    '+': '\\+',
    ',': '\\,',
    ';': '\\;',
    '<': '\\<',
    '=': '\\=',
    '>': '\\>',
    '\\': '\\\\',
    ' ': '\\ '
};
class Ldap {
    constructor(config = {}) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
        if (!config.url) {
            const secure = (_a = config.secure) !== null && _a !== void 0 ? _a : process.env.LDAP_SECURE;
            const host = (_c = (_b = config.host) !== null && _b !== void 0 ? _b : process.env.LDAP_HOST) !== null && _c !== void 0 ? _c : '';
            const port = (_d = config.port) !== null && _d !== void 0 ? _d : process.env.LDAP_PORT;
            delete config.secure;
            delete config.host;
            delete config.port;
            config.url = `${secure ? 'ldaps://' : 'ldap://'}${host}:${port !== null && port !== void 0 ? port : (secure ? '636' : '389')}`;
        }
        this.bindDN = (_f = (_e = config.bindDN) !== null && _e !== void 0 ? _e : process.env.LDAP_DN) !== null && _f !== void 0 ? _f : '';
        this.bindCredentials = (_j = (_h = (_g = config.bindCredentials) !== null && _g !== void 0 ? _g : process.env.LDAP_PASSWORD) !== null && _h !== void 0 ? _h : process.env.LDAP_PASS) !== null && _j !== void 0 ? _j : '';
        delete config.bindDN;
        delete config.bindCredentials;
        if (!config.reconnect || config.reconnect === true)
            config.reconnect = {};
        if (!config.reconnect.initialDelay)
            config.reconnect.initialDelay = 500;
        if (!config.reconnect.failAfter)
            config.reconnect.failAfter = Number.MAX_SAFE_INTEGER;
        if (!config.reconnect.maxDelay)
            config.reconnect.maxDelay = 5000;
        this.config = config;
        this.poolSize = (_k = config.poolSize) !== null && _k !== void 0 ? _k : (parseInt((_l = process.env.LDAP_POOLSIZE) !== null && _l !== void 0 ? _l : 'NaN') || 5);
        this.clients = [];
        this.poolQueue = [];
    }
    async connect() {
        const client = (0, ldapjs_1.createClient)(this.config);
        client.busy = true;
        this.clients.push(client);
        try {
            return await new Promise((resolve, reject) => {
                client.on('connect', () => {
                    client.removeAllListeners('error');
                    client.removeAllListeners('connectError');
                    client.removeAllListeners('setupError');
                    client.bind(this.bindDN, this.bindCredentials, err => {
                        if (err)
                            reject(err);
                        client.on('error', e => console.warn('Caught an error on ldap client, it is probably a connection problem that will auto-reconnect.', e.message));
                        resolve(client);
                    });
                });
                client.on('error', (err) => {
                    reject(err);
                });
                client.on('connectError', (err) => {
                    reject(err);
                });
                client.on('setupError', (err) => {
                    reject(err);
                });
            });
        }
        catch (e) {
            this.clients = this.clients.filter(c => c !== client);
            throw e;
        }
    }
    async getClient() {
        let client = this.clients.find(c => !c.busy);
        if (!client) {
            if (this.clients.length < this.poolSize) {
                client = await this.connect();
            }
            else {
                client = await new Promise(resolve => {
                    this.poolQueue.push(client => {
                        resolve(client);
                    });
                });
            }
        }
        client.busy = true;
        return client;
    }
    release(client) {
        client.busy = false;
        const nextInQueue = this.poolQueue.shift();
        if (nextInQueue)
            nextInQueue(client);
    }
    async wait() {
        let loops = 0;
        while (true) {
            try {
                const client = await this.getClient();
                this.release(client);
            }
            catch (e) {
                if (loops++ < 2)
                    console.log('Unable to connect to LDAP, trying again in 2 seconds.');
                else
                    console.error('Unable to connect to LDAP. Trying again in 2 seconds.');
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
    }
    async get(base, options, controls) {
        return (await this.search(base, options, controls))[0];
    }
    async search(base, options, controls) {
        const stream = this.stream(base, options, controls);
        const results = [];
        for await (const result of stream) {
            results.push(result);
        }
        return results;
    }
    stream(base, options = {}, controls) {
        if (!options.paged || options.paged === true)
            options.paged = {};
        if (!options.paged.pageSize)
            options.paged.pageSize = 200;
        options.paged.pagePause = true;
        let unpause;
        let paused = true;
        let canceled = false;
        const stream = new stream_1.Readable({ objectMode: true, autoDestroy: true });
        stream._read = () => {
            paused = false;
            unpause === null || unpause === void 0 ? void 0 : unpause();
            unpause = undefined;
        };
        stream._destroy = (err, cb) => {
            canceled = true;
            cb(err);
        };
        const stacktraceError = {};
        Error.captureStackTrace(stacktraceError, this.stream);
        const sendError = (e) => {
            var _a, _b;
            if (canceled)
                return;
            e.clientstack = e.stack;
            e.stack = ((_a = stacktraceError.stack) !== null && _a !== void 0 ? _a : '').replace(/^Error:/, `Error: ${(_b = e.message) !== null && _b !== void 0 ? _b : ''}`);
            stream.emit('error', e);
        };
        this.getClient().then(client => {
            (0, stream_1.finished)(stream, () => { this.release(client); });
            client.search(base, options !== null && options !== void 0 ? options : {}, controls !== null && controls !== void 0 ? controls : [], (err, result) => {
                if (err)
                    return sendError(err);
                result.on('searchEntry', data => {
                    if (canceled)
                        return;
                    if (!stream.push({ ...data.object, _raw: data.raw }))
                        paused = true;
                });
                result.on('page', (result, cb) => {
                    if (paused)
                        unpause = cb;
                    else
                        cb === null || cb === void 0 ? void 0 : cb();
                });
                result.on('error', sendError);
                result.on('end', (result) => {
                    var _a, _b;
                    if (canceled)
                        return;
                    if ((result === null || result === void 0 ? void 0 : result.status) === 0) {
                        stream.push(null);
                    }
                    else {
                        sendError(new Error(`${(_a = result === null || result === void 0 ? void 0 : result.errorMessage) !== null && _a !== void 0 ? _a : 'LDAP Search Failed'}\nStatus: ${(_b = result === null || result === void 0 ? void 0 : result.status) !== null && _b !== void 0 ? _b : 'undefined'}`));
                    }
                });
            });
        }).catch(sendError);
        return stream;
    }
    async useClient(callback) {
        const client = await this.getClient();
        try {
            return await callback(client);
        }
        finally {
            this.release(client);
        }
    }
    /**
     * changes: { operation, modification }
     * Raw access to the modify LDAP functionality. Consider setAttribute, pushAttribute,
     * or pullAttribute instead, or addMember/removeMember to manage group memberships. These
     * methods add extra convenience.
     */
    async chainModify(dn, changes) {
        const changeList = changes.map((change) => new ldapjs_1.Change(change));
        return await this.useClient(async (client) => await new Promise((resolve, reject) => {
            client.modify(dn, changeList, err => {
                if (err)
                    reject(err);
                else
                    resolve(true);
            });
        }));
    }
    /**
     * Raw access to the modify LDAP functionality. Consider setAttribute, pushAttribute,
     * or pullAttribute instead, or addMember/removeMember to manage group memberships. These
     * methods add extra convenience.
     */
    async modify(dn, operation, modification) {
        return await this.useClient(async (client) => await new Promise((resolve, reject) => {
            client.modify(dn, new ldapjs_1.Change({ operation, modification }), err => {
                if (err)
                    reject(err);
                else
                    resolve(true);
            });
        }));
    }
    /**
     * Add an object into the system.
     */
    async add(newDn, entry) {
        return await this.useClient(async (client) => await new Promise((resolve, reject) => {
            client.add(newDn, entry, err => {
                if (err)
                    reject(err);
                else
                    resolve(true);
            });
        }));
    }
    /**
     * Remove an object from the system.
     */
    async remove(dn) {
        return await this.useClient(async (client) => await new Promise((resolve, reject) => {
            client.del(dn, err => {
                if (err)
                    reject(err);
                else
                    resolve(true);
            });
        }));
    }
    /**
     * Rename an object.
     */
    async modifyDN(oldDn, newDn) {
        return await this.useClient(async (client) => await new Promise((resolve, reject) => {
            client.modifyDN(oldDn, newDn, err => {
                if (err)
                    reject(err);
                else
                    resolve(true);
            });
        }));
    }
    /**
     * Use this method to completely replace an attribute. If you use it on an array attribute,
     * any existing values will be lost.
     */
    async setAttribute(dn, attribute, value) {
        return await this.modify(dn, 'replace', { [attribute]: value });
    }
    /**
     * Use this method to add more values to an array attribute without removing any existing values. Any
     * values that already exist will be ignored (if you used a raw 'modify' operation, you'd get an error).
     */
    async pushAttribute(dn, attribute, valueOrValues) {
        var _a;
        const values = Array.isArray(valueOrValues) ? valueOrValues : [valueOrValues];
        const current = await this.get(dn);
        const existingValues = new Set((_a = current[attribute]) !== null && _a !== void 0 ? _a : []);
        const newValues = values.filter(v => !existingValues.has(v));
        if (newValues.length === 0)
            return true;
        return await this.modify(dn, 'add', { [attribute]: newValues });
    }
    /**
     * Use this method to remove the specified values from an array attribute while leaving any other
     * values in place. Any values that don't already exist will be ignored (if you used a raw 'modify'
     * operation, you'd get an error).
     */
    async pullAttribute(dn, attribute, valueOrValues) {
        var _a;
        const values = Array.isArray(valueOrValues) ? valueOrValues : [valueOrValues];
        const current = await this.get(dn);
        const existingValues = new Set((_a = current[attribute]) !== null && _a !== void 0 ? _a : []);
        const oldValues = values.filter(v => existingValues.has(v));
        if (oldValues.length === 0)
            return true;
        return await this.modify(dn, 'delete', { [attribute]: oldValues });
    }
    /**
     * Use this method to add a member to a group. memberdn can be an array. each memberdn can be a group or a person.
     * Any memberdn entries that are already members will be ignored.
     */
    async addMember(memberdn, groupdn) {
        return await this.pushAttribute(groupdn, 'member', memberdn);
    }
    /**
     * Use this method to remove a member from a group. memberdn can be an array. each memberdn can be a group or a person.
     * Any memberdn entries that are not already members will be ignored.
     */
    async removeMember(memberdn, groupdn) {
        return await this.pullAttribute(groupdn, 'member', memberdn);
    }
    templateLiteralEscape(regex, replacements, strings, values) {
        let safe = '';
        for (let i = 0; i < strings.length; i++) {
            safe += strings[i];
            if (values.length > i) {
                safe += `${values[i]}`.replace(new RegExp(regex.source, 'gm'), (ch) => replacements[ch]);
            }
        }
        return safe;
    }
    filter(strings, ...values) {
        return this.templateLiteralEscape(/[\0()*\\]/, filterReplacements, strings, values);
    }
    filterAllowWildcard(strings, ...values) {
        return this.templateLiteralEscape(/[\0()\\]/, filterReplacements, strings, values);
    }
    dn(strings, ...values) {
        return this.templateLiteralEscape(/((^ )|["#+,;<=>\\]|( $))/, dnReplacements, strings, values);
    }
    in(values, property) {
        return `(|${values.map(v => this.filter `(${property}=${v})`).join('')})`;
    }
    any(values, wildcards = false) {
        return wildcards
            ? `(|${Object.entries(values).map(([k, v]) => this.filterAllowWildcard `(${k}=${v})`).join('')})`
            : `(|${Object.entries(values).map(([k, v]) => this.filter `(${k}=${v})`).join('')})`;
    }
    all(values, wildcards = false) {
        return wildcards
            ? `(&${Object.entries(values).map(([k, v]) => this.filterAllowWildcard `(${k}=${v})`).join('')})`
            : `(&${Object.entries(values).map(([k, v]) => this.filter `(${k}=${v})`).join('')})`;
    }
    anyall(values, wildcards = false) {
        return wildcards
            ? `(|${values.map(v => `(&${Object.entries(v).map(([prop, val]) => this.filterAllowWildcard `(${prop}=${val})`).join('')})`).join('')})`
            : `(|${values.map(v => `(&${Object.entries(v).map(([prop, val]) => this.filter `(${prop}=${val})`).join('')})`).join('')})`;
    }
}
exports.default = Ldap;
