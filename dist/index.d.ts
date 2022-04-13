/// <reference types="node" />
import { Client, ClientOptions, Control, SearchOptions } from 'ldapjs';
import { Readable } from 'stream';
declare type Optional<T, K extends keyof T> = Pick<Partial<T>, K> & Omit<T, K>;
interface StreamIterator<T> {
    [Symbol.asyncIterator]: () => StreamIterator<T>;
    next: () => Promise<{
        done: boolean;
        value: T;
    }>;
    return: () => Promise<{
        done: boolean;
        value: T;
    }>;
}
interface GenericReadable<T> extends Readable {
    [Symbol.asyncIterator]: () => StreamIterator<T>;
}
export interface LdapConfig extends Optional<ClientOptions, 'url'> {
    host?: string;
    port?: string | number;
    secure?: boolean;
    poolSize?: number;
}
interface LdapClient extends Client {
    busy?: boolean;
}
export default class Ldap {
    protected connectpromise?: Promise<void>;
    protected config: ClientOptions;
    protected clients: LdapClient[];
    protected poolSize: number;
    protected bindDN: string;
    protected bindCredentials: string;
    protected poolQueue: ((client: LdapClient) => void)[];
    constructor(config?: LdapConfig);
    protected connect(): Promise<LdapClient>;
    protected getClient(): Promise<LdapClient>;
    protected release(client: LdapClient): void;
    wait(): Promise<void>;
    get<T = any>(base: string, options?: SearchOptions, controls?: Control | Control[]): Promise<T>;
    search<T = any>(base: string, options?: SearchOptions, controls?: Control | Control[]): Promise<T[]>;
    stream<T = any>(base: string, options?: SearchOptions, controls?: Control | Array<Control>): GenericReadable<T>;
    protected useClient<T>(callback: (client: LdapClient) => Promise<T>): Promise<T>;
    /**
     * changes: { operation, modification }
     * Raw access to the modify LDAP functionality. Consider setAttribute, pushAttribute,
     * or pullAttribute instead, or addMember/removeMember to manage group memberships. These
     * methods add extra convenience.
     */
    chainModify(dn: string, changes: any): Promise<boolean>;
    /**
     * Raw access to the modify LDAP functionality. Consider setAttribute, pushAttribute,
     * or pullAttribute instead, or addMember/removeMember to manage group memberships. These
     * methods add extra convenience.
     */
    modify(dn: string, operation: string, modification: any): Promise<boolean>;
    /**
     * Add an object into the system.
     */
    add(newDn: string, entry: any): Promise<boolean>;
    /**
     * Remove an object from the system.
     */
    remove(dn: string): Promise<boolean>;
    /**
     * Rename an object.
     */
    modifyDN(oldDn: string, newDn: string): Promise<boolean>;
    /**
     * Use this method to completely replace an attribute. If you use it on an array attribute,
     * any existing values will be lost.
     */
    setAttribute(dn: string, attribute: string, value: any): Promise<boolean>;
    /**
     * Use this method to add more values to an array attribute without removing any existing values. Any
     * values that already exist will be ignored (if you used a raw 'modify' operation, you'd get an error).
     */
    pushAttribute(dn: string, attribute: string, valueOrValues: string | string[]): Promise<boolean>;
    /**
     * Use this method to remove the specified values from an array attribute while leaving any other
     * values in place. Any values that don't already exist will be ignored (if you used a raw 'modify'
     * operation, you'd get an error).
     */
    pullAttribute(dn: string, attribute: string, valueOrValues: string | string[]): Promise<boolean>;
    /**
     * Use this method to add a member to a group. memberdn can be an array. each memberdn can be a group or a person.
     * Any memberdn entries that are already members will be ignored.
     */
    addMember(memberdn: string | string[], groupdn: string): Promise<boolean>;
    /**
     * Use this method to remove a member from a group. memberdn can be an array. each memberdn can be a group or a person.
     * Any memberdn entries that are not already members will be ignored.
     */
    removeMember(memberdn: string | string[], groupdn: string): Promise<boolean>;
    protected templateLiteralEscape(regex: RegExp, replacements: any, strings: TemplateStringsArray, values: (string | number)[]): string;
    filter(strings: TemplateStringsArray, ...values: (string | number)[]): string;
    filterAllowWildcard(strings: TemplateStringsArray, ...values: (string | number)[]): string;
    dn(strings: TemplateStringsArray, ...values: (string | number)[]): string;
    in(values: (string | number)[], property: string): string;
    any(values: Record<string, (string | number)>, wildcards?: boolean): string;
    all(values: Record<string, (string | number)>, wildcards?: boolean): string;
    anyall(values: Record<string, string | number>[], wildcards?: boolean): string;
}
export {};
