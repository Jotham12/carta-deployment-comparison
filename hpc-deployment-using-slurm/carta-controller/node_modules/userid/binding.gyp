{
  "targets": [
    {
      "target_name": "userid",
      "sources": [ '<!@(ls -1 src/*.cc)' ],
      "include_dirs": ["<!@(node -p \"require('node-addon-api').include\")"],
      "dependencies": ["<!(node -p \"require('node-addon-api').gyp\")"],
      "cflags!": [ "-fno-exceptions" ],
      "cflags_cc!": [ "-fno-exceptions" ],
      "xcode_settings": {
        "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
        "CLANG_CXX_LIBRARY": "libc++",
        "MACOSX_DEPLOYMENT_TARGET": "10.7",
      },
      "msvs_settings": {
        "VCCLCompilerTool": { "ExceptionHandling": 1 },
      },
      "variables" : {
        "generate_coverage": "<!(echo $GENERATE_COVERAGE)",
      },
      "conditions": [
        ['OS=="mac"', {
            "cflags+": ["-fvisibility=hidden"],
            "xcode_settings": {
              "GCC_SYMBOLS_PRIVATE_EXTERN": "YES", # -fvisibility=hidden
            },
        }],
        ['generate_coverage=="yes"', {
            "cflags+": ["--coverage"],
            "cflags_cc+": ["--coverage"],
            "link_settings": {
              "libraries+": ["-lgcov"],
            },
        }],
      ],
    },
  ],
}
