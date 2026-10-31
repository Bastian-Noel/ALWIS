# Included in the MariaDB cross build by attach.cmake.
if(NOT EMSCRIPTEN OR NOT PBL_PHP_BUILD)
  message(FATAL_ERROR "Requires the MariaDB Emscripten build and -DPBL_PHP_BUILD")
endif()
add_executable(pbl-fusion "${PBL_SPIKE_SOURCE}/select-one.c" "${CMAKE_SOURCE_DIR}/wasm/lite4mariadb.c")
target_compile_definitions(pbl-fusion PRIVATE EMBEDDED_LIBRARY)
target_compile_options(pbl-fusion PRIVATE -O2 -pthread)
target_include_directories(pbl-fusion PRIVATE
  "${CMAKE_SOURCE_DIR}/include" "${CMAKE_BINARY_DIR}/include"
  "${PBL_PHP_BUILD}" "${PBL_PHP_BUILD}/main" "${PBL_PHP_BUILD}/Zend"
  "${PBL_PHP_BUILD}/TSRM" "${PBL_PHP_BUILD}/sapi/embed")
target_link_libraries(pbl-fusion PRIVATE "${PBL_PHP_BUILD}/.libs/libphp.a" mysqlserver)
add_dependencies(pbl-fusion GenError)
set_target_properties(pbl-fusion PROPERTIES SUFFIX ".mjs" RUNTIME_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}/fusion-dist")
target_link_options(pbl-fusion PRIVATE -O2 -pthread -fexceptions --no-entry
  "SHELL:-s MODULARIZE=1" "SHELL:-s EXPORT_ES6=1" "SHELL:-s EXPORT_NAME=createFusion"
  "SHELL:-s ENVIRONMENT=web,worker,node" "SHELL:-s ALLOW_MEMORY_GROWTH=1"
  "SHELL:-s INITIAL_MEMORY=268435456" "SHELL:-s MAXIMUM_MEMORY=2147483648"
  "SHELL:-s STACK_SIZE=16777216" "SHELL:-s PTHREAD_POOL_SIZE=16"
  "SHELL:-s EXIT_RUNTIME=0" "SHELL:-s INVOKE_RUN=0" "SHELL:-s ASYNCIFY=1"
  "SHELL:-s ASYNCIFY_STACK_SIZE=131072" "SHELL:-s DISABLE_EXCEPTION_CATCHING=0"
  "SHELL:-s EXPORTED_FUNCTIONS=['_pbl_run_select','_pbl_sql_started','_pbl_direct_calls','_pbl_sql_stop','_malloc','_free']"
  "SHELL:-s EXPORTED_RUNTIME_METHODS=['ccall','FS','HEAPU8']"
  "SHELL:-lidbfs.js" "SHELL:-lnodefs.js"
  "SHELL:--embed-file ${CMAKE_SOURCE_DIR}/sql/share/charsets@/mariadb/share/charsets"
  "SHELL:--embed-file ${CMAKE_BINARY_DIR}/sql/share@/mariadb/share")
include("${PBL_SPIKE_SOURCE}/runtime-target.cmake")
