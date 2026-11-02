# Inject into the pinned MariaDB top-level configure without editing its CMake files.
cmake_language(DEFER CALL include "${PBL_SPIKE_SOURCE}/CMakeLists.txt")
