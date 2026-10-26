package main

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path"
	"path/filepath"
	"strings"
)

type response struct { YAML string `json:"yaml,omitempty"`; Error string `json:"error,omitempty"` }
func writeJSON(w http.ResponseWriter, status int, v response) { w.Header().Set("Content-Type","application/json"); w.WriteHeader(status); _ = json.NewEncoder(w).Encode(v) }
func cleanBundlePath(s string) (string,error) {
	s=strings.TrimPrefix(path.Clean("/"+strings.ReplaceAll(s,"\\","/")),"/")
	if s=="." || s=="" || strings.HasPrefix(s,"../") { return "", errors.New("invalid source path") }
	return s,nil
}
func extractZip(r io.ReaderAt, size int64, dest string) error {
	z,err:=zip.NewReader(r,size); if err!=nil{return err}
	for _,f:=range z.File {
		name:=strings.ReplaceAll(f.Name,"\\","/")
		if strings.HasPrefix(name,"/") || path.Clean(name)==".." || strings.HasPrefix(path.Clean(name),"../") { return fmt.Errorf("unsafe path in ZIP: %s",name) }
		target:=filepath.Join(dest,filepath.FromSlash(name))
		if !strings.HasPrefix(target,filepath.Clean(dest)+string(os.PathSeparator)) { return errors.New("unsafe ZIP path") }
		if f.FileInfo().IsDir(){ if err=os.MkdirAll(target,0755);err!=nil{return err};continue }
		if err=os.MkdirAll(filepath.Dir(target),0755);err!=nil{return err}
		in,e:=f.Open();if e!=nil{return e}
		out,e:=os.OpenFile(target,os.O_CREATE|os.O_TRUNC|os.O_WRONLY,0644);if e!=nil{in.Close();return e}
		_,e=io.Copy(out,io.LimitReader(in,20<<20));in.Close();out.Close();if e!=nil{return e}
	}
	return nil
}
func render(w http.ResponseWriter,r *http.Request) {
	if r.Method!=http.MethodPost { writeJSON(w,405,response{Error:"POST required"});return }
	r.Body=http.MaxBytesReader(w,r.Body,50<<20)
	if err:=r.ParseMultipartForm(50<<20);err!=nil{writeJSON(w,400,response{Error:"Upload a ZIP under 50 MB."});return}
	file,_,err:=r.FormFile("bundle");if err!=nil{writeJSON(w,400,response{Error:"ZIP bundle is required."});return};defer file.Close()
	buf,err:=io.ReadAll(io.LimitReader(file,50<<20));if err!=nil{writeJSON(w,400,response{Error:"Unable to read ZIP."});return}
	source,err:=cleanBundlePath(r.FormValue("sourcePath"));if err!=nil{writeJSON(w,400,response{Error:err.Error()});return}
	kind:=r.FormValue("kind"); values:=r.FormValue("valuesFile")
	tmp,err:=os.MkdirTemp("","k8s-render-*");if err!=nil{writeJSON(w,500,response{Error:"Unable to prepare renderer."});return};defer os.RemoveAll(tmp)
	if err=extractZip(bytes.NewReader(buf),int64(len(buf)),tmp);err!=nil{writeJSON(w,400,response{Error:"Invalid ZIP: "+err.Error()});return}
	root:=tmp
	// Handle the common ZIP layout where every entry is nested beneath one root directory.
	entries,_:=os.ReadDir(root);if len(entries)==1&&entries[0].IsDir(){root=filepath.Join(root,entries[0].Name())}
	sourceAbs:=filepath.Join(root,filepath.FromSlash(source))
	if !strings.HasPrefix(sourceAbs,filepath.Clean(root)+string(os.PathSeparator)){writeJSON(w,400,response{Error:"Source path escapes the bundle."});return}
	var cmd *exec.Cmd
	switch kind {
	case "kustomize":
		if filepath.Base(source)!="kustomization.yaml" && filepath.Base(source)!="kustomization.yml" && filepath.Base(source)!="Kustomization" { writeJSON(w,400,response{Error:"Choose a kustomization file."});return }
		cmd=exec.CommandContext(r.Context(),"kubectl","kustomize",filepath.Dir(sourceAbs))
	case "helm":
		chartDir:=filepath.Dir(sourceAbs)
		args:=[]string{"template","sketchizi",chartDir}
		if values!="" {
			v,cleanErr:=cleanBundlePath(values);if cleanErr!=nil{writeJSON(w,400,response{Error:"Invalid values file path."});return}
			vabs:=filepath.Join(root,filepath.FromSlash(v));if !strings.HasPrefix(vabs,filepath.Clean(root)+string(os.PathSeparator)){writeJSON(w,400,response{Error:"Values path escapes the bundle."});return}
			if _,e:=os.Stat(vabs);e!=nil{writeJSON(w,400,response{Error:"Values file not found in the ZIP."});return}
			args=append(args,"-f",vabs)
		}
		cmd=exec.CommandContext(r.Context(),"helm",args...)
	default: writeJSON(w,400,response{Error:"kind must be kustomize or helm"});return
	}
	cmd.Dir=root
	out,err:=cmd.Output();if err!=nil{
		msg:=strings.TrimSpace(err.Error());if ee,ok:=err.(*exec.ExitError);ok{msg=strings.TrimSpace(string(ee.Stderr))}
		writeJSON(w,422,response{Error:"Rendering failed: "+msg});return
	}
	if len(bytes.TrimSpace(out))==0{writeJSON(w,422,response{Error:"Renderer produced no Kubernetes YAML."});return}
	writeJSON(w,200,response{YAML:string(out)})
}
func main(){
	mux:=http.NewServeMux();mux.HandleFunc("/health",func(w http.ResponseWriter,r *http.Request){w.WriteHeader(200);_,_=w.Write([]byte("ok"))});mux.HandleFunc("/render",render)
	addr:=os.Getenv("PORT");if addr==""{addr="8080"};_ = http.ListenAndServe(":"+addr,mux)
}
