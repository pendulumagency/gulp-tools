const gulp = require("gulp");
const del = require("del");
const sass = require("gulp-sass");

let defaultRollupOptions = null;
const getDefaultRollupOptions = () => {
    if (!defaultRollupOptions) {
        const babel = require("rollup-plugin-babel");
        const nodeResolve = require("rollup-plugin-node-resolve");
        const commonJs = require("rollup-plugin-commonjs");

        defaultRollupOptions = [{
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
    }
    return defaultRollupOptions;
}




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

    let deployTask = null;
    let serveTask = null;


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
        const {src, dest, watchSrc, options} = include.scss;
        const {scss, scssWatch} = createSass(src, dest, watchSrc);

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
        let declarationsTask;
        let cleanTask;

        const declarationOptions = include.ts.declarations;

        if (declarationOptions) {
            const {src, dest} = declarationOptions;

            const declarations  = () => gulp.src(src)
                .pipe(gulp.dest(dest));

            const declarationsWatch = () => gulp.watch(src, declarations);

            tasks.declarations = declarations;
            declarationsTask = declarations;
            watchTasks.push(declarationsWatch);
        }

        let rollupOptions = include.ts.rollup; // To deal with variable/constant scope and same-named variables

        if (rollupOptions) {
            const rollupPipe = require("gulp-better-rollup");
            const uglify = require("gulp-uglify");

            let single = rollupOptions.src && rollupOptions.dest;

            if (single) {
                const {src, dest, options} = rollupOptions;
                
                const rollup = () => gulp.src(src)
                    .pipe(rollupPipe(...(options || getDefaultRollupOptions())))
                    .pipe(uglify())
                    .pipe(gulp.dest(dest));

                const rollupWatch = () => gulp.watch(src, rollup);

                tasks.rollup = rollup;
                rollupTask = rollup;
                watchTasks.push(rollupWatch);
            } else {
                let rollupTasks = [];

                for (const key of Object.keys(rollupOptions)) {
                    const {src, dest, options} = rollupOptions[key];

                    const k = key + "Rollup";
    
                    const t = {
                        [k]: () => gulp.src(src)
                            .pipe(rollupPipe(...(options || getDefaultRollupOptions())))
                            .pipe(uglify())
                            .pipe(gulp.dest(dest)),
                        [k + "Watch"]: () => gulp.watch(src, t[key + "Rollup"])
                    }
    
                    tasks[k] = t[k];
                    rollupTasks.push(t[k]);
                    watchTasks.push(t[k + "Watch"]);
                }

                rollupTask = gulp.parallel(...rollupTasks);
            }

        }

        if (clean) {
            const tsClean = () => del(clean);
            tasks.tsClean = tsClean;
            cleanTask = tsClean;
        }

        tsAndRollup = [ts];
        if (rollupTask || declarationsTask) { // rollup and decl copy can be parallel
            const t = [];
            if (rollupTask) t.push(rollupTask);
            if (declarationsTask) t.push(declarationsTask);

            tsAndRollup.push(t.length > 1 ? gulp.parallel(...t) : t[0]);
        }
        if (cleanTask) tsAndRollup.push(cleanTask);

        tasks.ts = ts;
        parallelBuildTasks.push(tsAndRollup.length > 1 ? gulp.series(...tsAndRollup) : ts); // TODO: Include Rollup and delete temp directory
        watchTasks.push(tsWatch);
    }



    let browserSync = null;
    if (include.deploy || include.serve) {
        browserSync = require("browser-sync");
    }


    /**
     * Setup deploy tasks (or deploy and repload if also using serve with browserSync)
     */
    if (include.deploy) {
        const cache = require("gulp-cached");

        const {src, dest} = include.deploy;

        const deploy = () => gulp.src(src)
            .pipe(gulp.dest(dest));

        
        if (include.serve) {
            const deployAndReload = () => gulp.src(src)
                .pipe(cache('deploy'))
                .pipe(gulp.dest(dest))
                .pipe(browserSync.stream())

            const deployWatch = () => gulp.watch(src, deployAndReload);

            watchTasks.push(deployWatch);            
        } else {
            const deployWatch = () => gulp.watch(src, deploy);

            watchTasks.push(deployWatch);
        }

        tasks.deploy = deploy;
        deployTask = deploy;
    }


    if (include.serve) {
        const {proxy, sslKey, sslCert} = include.serve;

        let https = sslKey || sslCert ? 
        {
            key: sslKey,
            cert: sslCert
        } : undefined;

        /**
         * Serve with BrowserSync
         */
        serveTask = done => {
            browserSync.init({
                proxy,
                https
            })
            done();
        }
    }



    /**
     * Setup main build and watch tasks
     */
    const buildTasks = [];
    if (cleanTask) buildTasks.push(cleanTask);
    if (parallelBuildTasks.length > 0) buildTasks.push(gulp.parallel(...parallelBuildTasks));

    const watch = watchTasks.length > 0 ? gulp.parallel(...watchTasks) : done => done(); // TODO: Don't even add watch if no watch tasks defined
    const build = gulp.series(...buildTasks);
    

    const buildAndWatchTasks = [build];
    if (deployTask) buildAndWatchTasks.push(deployTask);
    if (serveTask) buildAndWatchTasks.push(serveTask);
    buildAndWatchTasks.push(watch);

    const buildAndWatch = gulp.series(...buildAndWatchTasks);//build, /* deploy, serve, */ watch); // Not finished

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
        [name + "Watch"]: () => gulp.watch(src, result[name])
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
const createSass = (src, dest, watchSrc) => {
    const scss = () => gulp.src(src)
        .pipe(sass()) // TODO: allow options like csso, minification, sourcemaps, and logging
        .pipe(gulp.dest(dest))
    
    const scssWatch = () => gulp.watch(watchSrc || src, scss);
    
    return {scss, scssWatch}
}

/**
 * Create a typescript pipe for Gulp
 * @param {*} src 
 * @param {*} dest 
 * @param {*} config 
 */
const createTypeScript = (src, dest, config = "tsconfig.json") => {
    const typescript = require("gulp-typescript");
    
    const ts = () => gulp.src(src)
        .pipe(typescript.createProject("tsconfig.json")())
        .pipe(gulp.dest(dest));

    const tsWatch = () => gulp.watch(src, ts);

    return {ts, tsWatch};
}



module.exports = {
    createGulpfile
}