$ErrorActionPreference = "SilentlyContinue"
$parent = [int]$env:MONEXAM_PARENT_PID
Add-Type -ReferencedAssemblies System.Windows.Forms @"
using System;
using System.Collections.Concurrent;
using System.Diagnostics;
using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;
using System.Threading;
public class Verrou {
  delegate IntPtr Proc(int code, IntPtr wParam, IntPtr lParam);
  [DllImport("user32.dll")] static extern IntPtr SetWindowsHookEx(int id, Proc fn, IntPtr mod, uint tid);
  [DllImport("user32.dll")] static extern bool UnhookWindowsHookEx(IntPtr hk);
  [DllImport("user32.dll")] static extern IntPtr CallNextHookEx(IntPtr hk, int code, IntPtr wParam, IntPtr lParam);
  [DllImport("user32.dll")] static extern short GetAsyncKeyState(int vk);
  [DllImport("kernel32.dll")] static extern IntPtr GetModuleHandle(string name);
  [DllImport("user32.dll")] static extern IntPtr FindWindow(string cls, string title);
  [DllImport("user32.dll")] static extern IntPtr FindWindowEx(IntPtr parent, IntPtr after, string cls, string title);
  [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h, int cmd);
  static void Taskbar(bool show) {
    int cmd = show ? 5 : 0;
    IntPtr t = FindWindow("Shell_TrayWnd", null); if (t != IntPtr.Zero) ShowWindow(t, cmd);
    IntPtr s = IntPtr.Zero;
    while ((s = FindWindowEx(IntPtr.Zero, s, "Shell_SecondaryTrayWnd", null)) != IntPtr.Zero) ShowWindow(s, cmd);
  }
  static Proc keep; static IntPtr hook = IntPtr.Zero;
  static ConcurrentQueue<string> q = new ConcurrentQueue<string>();
  static long hooked = 0, blocked = 0;
  static bool Down(int vk) { return (GetAsyncKeyState(vk) & 0x8000) != 0; }
  static string Why(int vk, int flags) {
    bool alt = (flags & 0x20) != 0 || Down(0x12);
    bool ctrl = Down(0x11);
    bool win = Down(0x5B) || Down(0x5C);
    if (vk == 0x5B || vk == 0x5C) return "Windows";
    if (vk == 0x09 && alt) return "Alt+Tab";
    if (vk == 0x09 && ctrl) return "Ctrl+Tab";
    if (vk == 0x09 && win) return "Win+Tab";
    if (vk == 0x1B && alt) return "Alt+Echap";
    if (vk == 0x1B && ctrl) return "Ctrl+Echap";
    if (vk == 0x73 && alt) return "Alt+F4";
    if (vk == 0x20 && alt) return "Alt+Espace";
    if (win) return "Win+touche";
    return null;
  }
  static IntPtr Cb(int code, IntPtr wParam, IntPtr lParam) {
    if (code >= 0) {
      int vk = Marshal.ReadInt32(lParam);
      int flags = Marshal.ReadInt32(lParam, 8);
      string why = Why(vk, flags);
      if (why != null) {
        int msg = (int)wParam.ToInt64();
        if (msg == 0x100 || msg == 0x104) { Interlocked.Increment(ref blocked); q.Enqueue("BLOCK " + why); }
        return (IntPtr)1;
      }
    }
    return CallNextHookEx(hook, code, wParam, lParam);
  }
  static void Warm() {
    RuntimeHelpers.PrepareMethod(typeof(Verrou).GetMethod("Cb", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Static).MethodHandle);
    RuntimeHelpers.PrepareMethod(typeof(Verrou).GetMethod("Why", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Static).MethodHandle);
    IntPtr buf = Marshal.AllocHGlobal(24);
    try {
      int[] keys = { 0x41, 0x09, 0x5B, 0x1B, 0x73, 0x20 };
      foreach (int k in keys) { Marshal.WriteInt32(buf, k); Marshal.WriteInt32(buf, 8, 0x20); Why(k, 0x20); Why(k, 0); }
      Marshal.WriteInt32(buf, 0x41); Marshal.WriteInt32(buf, 8, 0);
      Cb(-1, (IntPtr)0x100, buf);
      string dummy; while (q.TryDequeue(out dummy)) {}
    } finally { Marshal.FreeHGlobal(buf); }
    Down(0x12); GetAsyncKeyState(0x11);
  }
  static void Install() {
    if (hook != IntPtr.Zero) { UnhookWindowsHookEx(hook); hook = IntPtr.Zero; }
    hook = SetWindowsHookEx(13, keep, GetModuleHandle(null), 0);
    hooked++;
  }
  public static void Run(int parent) {
    Thread.CurrentThread.Priority = ThreadPriority.Highest;
    try { Process.GetCurrentProcess().PriorityClass = ProcessPriorityClass.High; } catch {}
    keep = new Proc(Cb);
    Warm();
    Install();
    Taskbar(false);
    Console.Out.WriteLine(hook == IntPtr.Zero ? "FAIL" : "READY"); Console.Out.Flush();
    var t = new System.Windows.Forms.Timer(); t.Interval = 250;
    int tick = 0;
    t.Tick += delegate {
      string s; while (q.TryDequeue(out s)) Console.Out.WriteLine(s);
      Console.Out.Flush();
      tick++;
      if (tick % 8 == 0) { Install(); Taskbar(false); }
      if (tick % 240 == 0) { Console.Out.WriteLine("ALIVE hooks=" + hooked + " blocked=" + blocked); Console.Out.Flush(); }
      if (tick % 4 == 0) { try { Process.GetProcessById(parent); } catch { System.Windows.Forms.Application.Exit(); } }
    };
    t.Start();
    System.Windows.Forms.Application.Run();
    Taskbar(true);
    if (hook != IntPtr.Zero) UnhookWindowsHookEx(hook);
  }
}
"@
[Verrou]::Run($parent)
