=====================================================
  OctoProxy - macOS Installation Guide
=====================================================

If you see "Apple cannot verify" warning when opening
OctoProxy, please follow these steps:

1. Drag OctoProxy.app to Applications folder

2. Open Terminal and run:

   xattr -cr /Applications/OctoProxy.app

3. Open the app normally

=====================================================
  Why does this happen?
=====================================================
This warning appears because OctoProxy is not signed
with an Apple Developer certificate. The app is safe
to use - it's open source and you can verify the
code at: https://github.com/chouheiwa/OctoProxy

=====================================================
