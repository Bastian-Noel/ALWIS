# Custom C connection manager + native PDO/MySQLi + POSIX files + browser HTTP.
get_filename_component(PBL_REPO_SOURCE "${PBL_SPIKE_SOURCE}/../../.." ABSOLUTE)
set(PBL_GENERATED "${CMAKE_BINARY_DIR}/pbl-native-sources")
execute_process(COMMAND python3 "${PBL_REPO_SOURCE}/scripts/prepare-native-drivers.py"
  "${PBL_REPO_SOURCE}/build-work/php" "${PBL_PHP_BUILD}" "${PBL_GENERATED}"
  COMMAND_ERROR_IS_FATAL ANY)
add_executable(pbl-runtime
  "${PBL_GENERATED}/runtime.c" "${PBL_GENERATED}/mysql_driver.c"
  "${PBL_GENERATED}/pdo_mysql.c"
  "${PBL_GENERATED}/mysql_statement.c"
  "${PBL_GENERATED}/mysql_sql_parser.c"
  "${PBL_REPO_SOURCE}/packages/php-native/src/module.c"
  "${PBL_REPO_SOURCE}/packages/php-native/src/mysqli.c"
  "${PBL_REPO_SOURCE}/packages/sql-native/src/pbl_mysql.c"
  "${PBL_REPO_SOURCE}/packages/sql-native/src/console.c"
  "${PBL_REPO_SOURCE}/packages/files-native/src/files.c"
  "${PBL_REPO_SOURCE}/packages/network-native/src/http-stream.c"
  "${CMAKE_SOURCE_DIR}/wasm/lite4mariadb.c")
target_compile_definitions(pbl-runtime PRIVATE EMBEDDED_LIBRARY PDO_MYSQL_UNIX_ADDR="/tmp/mysql.sock")
target_compile_options(pbl-runtime PRIVATE -O2 -pthread -fexceptions)
target_include_directories(pbl-runtime PRIVATE
  "${PBL_GENERATED}" "${PBL_REPO_SOURCE}/packages/sql-native/include" "${PBL_REPO_SOURCE}/packages/php-native/src"
  "${CMAKE_SOURCE_DIR}/include" "${CMAKE_BINARY_DIR}/include"
  "${PBL_PHP_BUILD}" "${PBL_PHP_BUILD}/main" "${PBL_PHP_BUILD}/Zend" "${PBL_PHP_BUILD}/TSRM"
  "${PBL_PHP_BUILD}/ext/pdo_mysql")
target_link_libraries(pbl-runtime PRIVATE "${PBL_PHP_BUILD}/.libs/libphp.a" mysqlserver)
add_dependencies(pbl-runtime GenError)
get_target_property(pbl_runtime_options pbl-fusion LINK_OPTIONS)
list(FILTER pbl_runtime_options EXCLUDE REGEX "EXPORTED_FUNCTIONS|EXPORTED_RUNTIME_METHODS|EXPORT_NAME")
target_link_options(pbl-runtime PRIVATE ${pbl_runtime_options}
  "SHELL:-s EXPORT_NAME=createPHP" "SHELL:-s FETCH=1" -g2 "SHELL:-s ASSERTIONS=2"
  "SHELL:-s EXPORTED_FUNCTIONS=['_php_wasm_run','_php_wasm_exit_code','_php_wasm_abi_version','_php_wasm_version','_php_wasm_add_server_variable','_php_wasm_setenv','_malloc','_free','_pbl_fs_write','_pbl_fs_remove','_pbl_fs_rename','_pbl_mysql_started','_pbl_mysql_connection_count','_pbl_mysql_stop','_pbl_console_open','_pbl_console_close','_pbl_console_query','_pbl_console_length','_pbl_console_error','_pbl_console_sqlstate','_pbl_console_errno']"
  "SHELL:-s EXPORTED_RUNTIME_METHODS=['FS','IDBFS','ENV','ccall','cwrap','UTF8ToString','stringToUTF8','lengthBytesUTF8','HEAPU8']")
set_target_properties(pbl-runtime PROPERTIES SUFFIX ".mjs" RUNTIME_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}/runtime-dist")
