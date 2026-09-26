/** @param {number} code */
export function codeToDifficulty(code: number): "basic" | "advanced" | "expert" | "master" | "remaster" | "utage";
/** @param {number} code */
export function codeToChartType(code: number): "std" | "dx";
export const MAIMAI_DIFFICULTIES: readonly ["basic", "advanced", "expert", "master", "remaster", "utage"];
export const MAIMAI_CHART_TYPES: readonly ["std", "dx"];
export const MAIMAI_COMBO_STATUSES: readonly ["none", "fc", "fc+", "ap", "ap+"];
export const MAIMAI_SYNC_STATUSES: readonly ["none", "sync", "fs", "fs+", "fdx", "fdx+"];
export const MAIMAI_TITLE_TYPES: readonly ["normal", "bronze", "silver", "gold", "rainbow"];
export const RANKING_BUCKET_CODES: {
    readonly 1: "new";
    readonly 2: "old";
};
export namespace GAME_CODE_MAPS {
    namespace maimai {
        export let chartType: {
            0: string;
        };
        export let difficulty: {
            [k: string]: string;
        };
        export let comboStatus: {
            [k: string]: string;
        };
        export let syncStatus: {
            [k: string]: string;
        };
        export let clearStatus: {
            0: string;
        };
        export let titleType: {
            [k: string]: string;
        };
        export { RANKING_BUCKET_CODES as rankingBucket };
    }
    namespace chunithm {
        let chartType_1: {
            0: string;
            1: string;
        };
        export { chartType_1 as chartType };
        let difficulty_1: {
            0: string;
            1: string;
            2: string;
            3: string;
            4: string;
            5: string;
        };
        export { difficulty_1 as difficulty };
        let comboStatus_1: {
            0: string;
            1: string;
            2: string;
            3: string;
        };
        export { comboStatus_1 as comboStatus };
        let syncStatus_1: {
            0: string;
            1: string;
            2: string;
        };
        export { syncStatus_1 as syncStatus };
        let clearStatus_1: {
            0: string;
            1: string;
            2: string;
            3: string;
            4: string;
            5: string;
        };
        export { clearStatus_1 as clearStatus };
        let titleType_1: {
            0: string;
        };
        export { titleType_1 as titleType };
        export { RANKING_BUCKET_CODES as rankingBucket };
    }
}
