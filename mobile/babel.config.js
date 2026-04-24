module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      'nativewind/babel',
    ],
    plugins: [
      [
        'module-resolver',
        {
          root: ['./'],
          alias: {
            '@': './',
            '@/lib': './lib',
            '@/api': './api',
            '@/store': './store',
            '@/components': './components',
            '@/hooks': './hooks',
            '@/types': './types',
          },
        },
      ],
      'react-native-reanimated/plugin',
    ],
  };
};
