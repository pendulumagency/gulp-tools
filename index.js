const gulp = require("gulp");
const del = require("del");
const sass = require("gulp-sass");

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
    let rollupTask = null; // Compilation and bundling of JavaScript

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

    if (include.scss) {
        const {src, dest, options} = include.scss;
        const {scss, scssWatch} = createSass(src, dest);

        tasks.scss = scss;
        parallelBuildTasks.push(scss);
        watchTasks.push(scssWatch);
    }

    /**
     * Setup main build and watch tasks
     */
    const buildTasks = [];
    if (cleanTask) buildTasks.push(cleanTask);
    if (parallelBuildTasks.length > 0) buildTasks.push(gulp.parallel(...parallelBuildTasks));
    if (rollupTask) buildTasks.push(rollupTask);

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

        console.log(result[key + "Watch"]);

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



module.exports = {
    createGulpfile
}


// Tests
console.log(createGulpfile({
    include: {
        clean: true,
        copy: {
            static: ["./src/static/**/*", "./dist"]
        },
        scss: {
            src: "./src/scss",
            dest: "./dist"
        }
    }
}));