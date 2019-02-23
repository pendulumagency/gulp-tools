const gulp = require("gulp");
const del = require("del");
const sass = require("gulp-sass");
const typescript = require("gulp-typescript");

const rollupPipe = require("gulp-better-rollup");
const babel = require("rollup-plugin-babel");
const nodeResolve = require("rollup-plugin-node-resolve");
const commonJs = require("rollup-plugin-commonjs");


const defaultRollupOptions = [{
    "plugins": [
        babel({
            babelrc: false,
            comments: false,
            presets: [['@babel/preset-env', {
                targets: {
                    "ie": "11"
                },
                loose: true,
                modules: false
            }]],
            runtimeHelpers: true,
            plugins: [
                ["@babel/transform-runtime"]
            ]
        }),
        commonJs(),
        nodeResolve()
    ]
}, {
    "format": "iife"
}]


/**
 * Generates exports for a gulpfile based on our common business patterns
 * @param {*} options 
 */
const createGulpfile = (options) => {
    const {
        include = {}
    } = options;


    let tasks = {}; // Tasks that may be called individually

    let cleanTask = null; // Before all other build tasks
    let parallelBuildTasks = []; // One-time build of project

    let watchTasks = []; // Watch tasks in parallel


    /**
     * Setup clean tasks
     */
    if (include.clean) {
        const cleanParams = include.clean;
        const clean = () => del(cleanParams);

        cleanTask = clean;
        tasks.clean = clean;
        // Clean doesn't have a watch task associated with it
    }

    /**
     * Setup copy tasks
     */
    if (include.copy) {
        const copyDefsParam = include.copy;
        const result = createCopyAll(copyDefsParam);

        tasks = {...tasks, ...result.tasks};
        parallelBuildTasks = [...parallelBuildTasks, ...result.parallelBuildTasks];
        watchTasks = [...watchTasks, ...result.watchTasks];
    }

    /**
     * Setup Sass tasks
     */
    if (include.scss) {
        const {src, dest, options} = include.scss;
        const {scss, scssWatch} = createSass(src, dest);

        tasks.scss = scss;
        parallelBuildTasks.push(scss);
        watchTasks.push(scssWatch);
    }
    
    /**
     * Setup TypeScript tasks
     */
    if (include.ts) {
        const {src, dest, tsconfig, clean} = include.ts;
        const {ts, tsWatch} = createTypeScript(src, dest, tsconfig);

        let rollupTask;
        let cleanTask;

        let rollupOptions = include.ts.rollup; // To deal with variable/constant scope and same-named variables

        if (rollupOptions) {
            const {src, dest, options} = rollupOptions;

            const rollup = () => gulp.src(src)
                .pipe(rollupPipe(options || defaultRollupOptions))
                .pipe(gulp.dest(dest));

            const rollupWatch = () => gulp.watch(src, rollup);

            tasks.rollup = rollup;
            rollupTask = rollup;
            watchTasks.push(rollupWatch);
        }

        if (clean) {
            const tsClean = () => del(clean);
            tasks.tsClean = tsClean;
            cleanTask = tsClean;
        }

        tsAndRollup = [ts];
        if (rollupTask) tsAndRollup.push(rollupTask);
        if (cleanTask) tsAndRollup.push(cleanTask);

        tasks.ts = ts;
        parallelBuildTasks.push(tsAndRollup.length > 1 ? gulp.series(...tsAndRollup) : ts); // TODO: Include Rollup and delete temp directory
        watchTasks.push(tsWatch);
    }




    /**
     * Setup main build and watch tasks
     */
    const buildTasks = [];
    if (cleanTask) buildTasks.push(cleanTask);
    if (parallelBuildTasks.length > 0) buildTasks.push(gulp.parallel(...parallelBuildTasks));

    const watch = watchTasks.length > 0 ? gulp.parallel(...watchTasks) : done => done(); // TODO: Don't even add watch if no watch tasks defined
    const build = gulp.series(...buildTasks);
    const buildAndWatch = gulp.series(build, /* deploy, serve, */ watch); // Not finished

    return {
        ...tasks,
        watch,
        build,
        buildAndWatch,
        default: buildAndWatch
    }
}

/**
 * Create many copy tasks named after given keys with src and dest arrays
 * @param {*} copyDefs 
 */
const createCopyAll = (copyDefs) => {
    let tasks = {};
    const parallelBuildTasks = [];
    const watchTasks = [];

    for (const key of Object.keys(copyDefs)) {
        const [src, dest] = copyDefs[key];
        const result = createCopy(key, src, dest)

        tasks = {...tasks, ...result};
        parallelBuildTasks.push(result[key]);
        watchTasks.push(result[key + "Watch"]);
    }

    return {
        tasks,
        parallelBuildTasks,
        watchTasks
    }
}

/**
 * Generate a copy function for Gulp
 * @param {*} src 
 * @param {*} dest 
 */
const createCopy = (name, src, dest) => {
    const result = {
        [name]: () => gulp.src(src).pipe(gulp.dest(dest)),
        [name + "Watch"]: () => gulp.watch(src, copy)
    }
    return result;
    const copy = () => gulp.src(src).pipe(gulp.dest(dest));
    const copyWatch = () => gulp.watch(src, copy);

    return {copy, copyWatch};
}

/**
 * Creates a sass pipe for Gulp
 * @param {*} src 
 * @param {*} dest 
 */
const createSass = (src, dest) => {
    const scss = () => gulp.src(src)
        .pipe(sass()) // TODO: allow options like csso, minification, sourcemaps, and logging
        .pipe(gulp.dest(dest))
    
    const scssWatch = () => gulp.watch(src, scss);
    
    return {scss, scssWatch}
}

/**
 * Create a typescript pipe for Gulp
 * @param {*} src 
 * @param {*} dest 
 * @param {*} config 
 */
const createTypeScript = (src, dest, config = "tsconfig.json") => {
    const ts = () => gulp.src(src)
        .pipe(typescript.createProject("tsconfig.json")())
        .pipe(gulp.dest(dest));

    const tsWatch = () => gulp.watch(src, ts);

    return {ts, tsWatch};
}



module.exports = {
    createGulpfile
}