$ErrorActionPreference = "SilentlyContinue"
$parent = [int]$env:MONEXAM_PARENT_PID
Add-Type -ReferencedAssemblies System.Windows.Forms @"
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;
public class Verrou {
  delegate IntPtr Proc(int code, IntPtr wParam, IntPtr lParam);
  [DllImport("user32.dll")] static extern IntPtr SetWindowsHookEx(int id, Proc fn, IntPtr mod, uint tid);
  [DllImport("user32.dll")] static extern bool UnhookWindowsHookEx(IntPtr hk);
  [DllImport("user32.dll")] static extern IntPtr CallNextHookEx(IntPtr hk, int code, IntPtr wParam, IntPtr lParam);
  [DllImport("user32.dll")] static extern short GetAsyncKeyState(int vk);
  [DllImport("kernel32.dll")] static extern IntPtr GetModuleHandle(string name);
  static Proc keep; static IntPtr hook = IntPtr.Zero;
  static bool Down(int vk) { return (GetAsyncKeyState(vk) & 0x8000) != 0; }
  static IntPtr Cb(int code, IntPtr wParam, IntPtr lParam) {
    if (code >= 0) {
      int vk = Marshal.ReadInt32(lParam);
      int flags = Marshal.ReadInt32(lParam, 8);
      bool alt = (flags & 0x20) != 0 || Down(0x12);
      bool ctrl = Down(0x11);
      bool win = Down(0x5B) || Down(0x5C);
      string why = null;
      if (vk == 0x5B || vk == 0x5C) why = "Windows";
      else if (vk == 0x09 && alt) why = "Alt+Tab";
      else if (vk == 0x09 && (ctrl || win)) why = ctrl ? "Ctrl+Tab" : "Win+Tab";
      else if (vk == 0x1B && (alt || ctrl)) why = alt ? "Alt+Echap" : "Ctrl+Echap";
      else if (vk == 0x73 && alt) why = "Alt+F4";
      else if (vk == 0x20 && alt) why = "Alt+Espace";
      else if (win) why = "Win+touche";
      if (why != null) {
        int msg = wParam.ToInt32();
        if (msg == 0x100 || msg == 0x104) { Console.Out.WriteLine("BLOCK " + why); Console.Out.Flush(); }
        return (IntPtr)1;
      }
    }
    return CallNextHookEx(hook, code, wParam, lParam);
  }
  public static void Run(int parent) {
    keep = new Proc(Cb);
    hook = SetWindowsHookEx(13, keep, GetModuleHandle(null), 0);
    Console.Out.WriteLine(hook == IntPtr.Zero ? "FAIL" : "READY"); Console.Out.Flush();
    var t = new System.Windows.Forms.Timer(); t.Interval = 1000;
    t.Tick += delegate { try { Process.GetProcessById(parent); } catch { System.Windows.Forms.Application.Exit(); } };
    t.Start();
    System.Windows.Forms.Application.Run();
    UnhookWindowsHookEx(hook);
  }
}
"@
[Verrou]::Run($parent)
